import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('./Code.gs',import.meta.url),'utf8');
const person='aaaaaaaa-0000-4000-8000-000000000001';
const cursor='bbbbbbbb-0000-4000-8000-000000000001';
const next='cccccccc-0000-4000-8000-000000000001';
const cell={type:'cell',date:'2026-11-01',line_id:'line:0',half:20,state:{person_id:person,tables:null}};
const owner={type:'person',id:person,state:{name:'Example',discord_id:'123456789012345678',mark:{text:'EX',background:'#ffffff',foreground:'#000000'}}};
test('calendar places coloured half-hour cells on the correct day and line, clearing removed owners',()=>{
  const {ctx}=fixture();
  const state={people:{[person]:owner.state},cells:{'2026-11-01|line:0|20':cell}};
  const lines=[{id:'line:0',number:1,variant:'regular',limit:50}];
  const m=ctx.calendarModel_(state,lines,'2026-11-01',30);
  assert.equal(m.values.length,30);assert.equal(m.values[0][0],'01, Вс');
  assert.equal(m.values[0][24],'EX');assert.equal(m.values[0][23],'');
  assert.equal(m.backgrounds[0][24],'#ffffff');assert.equal(m.notes[0][24],'Example');
  assert.equal(m.values[1][24],'');assert.equal(m.values[29][0],'30, Пн');
  state.cells={};assert.equal(ctx.calendarModel_(state,lines,'2026-11-01',30).values.length,0);
});
function fixture() {
  const values={RP_CURSOR:cursor,RP_ENABLED:'1'}, logs=[];
  const p={getProperty:k=>values[k]??null,setProperty:(k,v)=>{values[k]=v;},
    deleteProperty:k=>{delete values[k];},setProperties:v=>Object.assign(values,v),getProperties:()=>({...values})};
  const ctx=vm.createContext({console:{log:s=>logs.push(s)},Date,
    PropertiesService:{getScriptProperties:()=>p},
    SpreadsheetApp:{getActiveSpreadsheet:()=>({}),flush:()=>{}},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})}});
  vm.runInContext(source,ctx);ctx.writeStatus_=()=>{};
  return {ctx,values,logs};
}
test('all immutable pages are collected before exposing a final checkpoint',()=>{
  const {ctx}=fixture();let calls=0;
  ctx.request_=(path)=>{
    calls++;
    if(calls===1)return {api_version:'2',mode:'full',batch_id:'batch',items:[owner],lines:[],has_more:true,cursor:null,next_page:next};
    assert.equal(path,'v2/schedule?page='+next);
    return {api_version:'2',mode:'full',batch_id:'batch',items:[cell],has_more:false,cursor:cursor};
  };
  const result=ctx.fetchBatch_(null,{});assert.equal(result.items.length,2);assert.equal(result.cursor,cursor);
});
test('a changed batch id is rejected before any data can be written',()=>{
  const {ctx}=fixture();let calls=0;
  ctx.request_=()=>({api_version:'2',mode:'full',batch_id:String(++calls),items:[],lines:[],has_more:calls===1,cursor:calls===1?null:cursor,next_page:next});
  assert.throws(()=>ctx.fetchBatch_(null,{}),/Сменился пакет/);
});
test('full state resolves owners, clears missing old data and protects formula-like names',()=>{
  const {ctx}=fixture();const s=ctx.merge_({mode:'full',items:[owner,cell]});
  assert.equal(Object.keys(s.cells).length,1);assert.equal(s.people[person].name,'Example');
  assert.equal(Object.keys(ctx.merge_({mode:'full',items:[]}).cells).length,0);
  assert.equal(ctx.safe_('=IMPORTXML("https://example.com")'),'\'=IMPORTXML("https://example.com")');
  assert.throws(()=>ctx.merge_({mode:'full',items:[cell]}),/Нет владельца/);
});
test('a partial sheet failure keeps the cursor; replay commits only after a successful flush',()=>{
  const {ctx,values}=fixture();let flushed=false;
  ctx.fetchBatch_=(_c,c)=>{c.calls++;return {mode:'delta',items:[cell],cursor:next};};
  ctx.merge_=()=>({people:{},cells:{}});ctx.writeData_=()=>{throw Error('synthetic write failure');};
  ctx.syncNow();assert.equal(values.RP_CURSOR,cursor);assert.ok(values.RP_ERROR);
  ctx.writeData_=()=>{};ctx.SpreadsheetApp.flush=()=>{flushed=true;};ctx.syncNow();
  assert.equal(flushed,true);assert.equal(values.RP_CURSOR,next);assert.equal(values.RP_ERROR,'');
});
test('unchanged response skips all sheet data reads and writes',()=>{
  const {ctx,values}=fixture();
  ctx.fetchBatch_=(_c,c)=>{c.calls++;return {mode:'unchanged',items:[],cursor:next};};
  ctx.merge_=ctx.writeData_=()=>{throw Error('must not touch data');};ctx.syncNow();
  assert.equal(values.RP_CURSOR,next);assert.equal(values.RP_ERROR,'');
});
test('410 forces one full resync; 429 keeps the checkpoint and schedules a retry',()=>{
  const {ctx,values}=fixture();let calls=0;
  ctx.fetchBatch_=(c,stats)=>{stats.calls++;if(++calls===1)throw Object.assign(Error(),{http:410});
    assert.equal(c,null);return {mode:'full',items:[],lines:[],cursor:next};};
  ctx.merge_=()=>({people:{},cells:{}});ctx.writeData_=()=>{};ctx.syncNow();assert.equal(values.RP_CURSOR,next);
  ctx.fetchBatch_=(_c,stats)=>{stats.calls++;throw Object.assign(Error(),{http:429,retry:60});};ctx.syncNow();
  assert.equal(values.RP_CURSOR,next);assert.ok(Number(values.RP_NEXT)>Date.now());
});
