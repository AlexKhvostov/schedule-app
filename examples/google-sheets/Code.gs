/** @OnlyCurrentDoc */
// Bound Google Apps Script. The API key never appears in code, cells or logs.
const RP_ = {
  base: 'https://wvfllegshaqonqqpbtle.supabase.co/functions/v1/external-api/',
  date: '2026-11-01', days: 30, intervalMs: 180000,
  slots: ['Дата','Вариант','Лимит','Линия','Начало','Конец','Игрок','Метка','Столы','ID человека','ID линии','Получас'],
  people: ['Игрок','Discord ID','Метка','Цвет фона','Цвет текста','ID человека']
};

function setupRedParty() {
  const p=PropertiesService.getScriptProperties(), ss=SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Запустите скрипт, связанный с таблицей.');
  if (!p.getProperty('RP_KEY')) {
    // Three UUIDs, SHA-256 compressed to the integration key format.
    p.setProperty('RP_KEY','rp_'+hash_(Utilities.getUuid()+Utilities.getUuid()+Utilities.getUuid()));
  }
  p.setProperty('RP_SHEET',ss.getId());
  if (!p.getProperty('RP_ENABLED')) p.setProperty('RP_ENABLED','0');
  let slots=ss.getSheetByName('Слоты')||ss.getSheetByName('Расписание');
  if (!slots) {
    const first=ss.getSheets()[0];
    slots=ss.getSheets().length===1 && first.getLastRow()===0
      ? first.setName('Расписание') : ss.insertSheet('Расписание');
  }
  ensureHeader_(slots,RP_.slots);
  ensureHeader_(ss.getSheetByName('Люди')||ss.insertSheet('Люди'),RP_.people);
  const status=ss.getSheetByName('Синхронизация')||ss.insertSheet('Синхронизация');
  status.getRange('A1:A16').setValues([
    ['Показатель'],['Состояние'],['Период'],['Часовой пояс слотов'],['Последняя проверка'],
    ['Последнее изменение'],['Последний ответ'],['Людей'],['Слотов'],['Запросов HTTP'],
    ['Получено байт JSON'],['Источник'],['Автообновление'],['Последняя ошибка'],
    ['Правило обновления'],['Часовой пояс проверок']]);
  status.getRange('B1').setValue('Значение');
  status.getRange('B15:B16').setValues([['Первый запрос — полный месяц, затем изменения по курсору.'],['Europe/Minsk']]);
  status.setColumnWidth(1,230); status.setColumnWidth(2,650);
  ss.setSpreadsheetTimeZone('Europe/Minsk');
  slots.setColumnWidth(7,190); slots.hideColumns(10,3);
  ss.getSheetByName('Люди').setColumnWidth(1,190);
  ss.getSheetByName('Люди').setColumnWidth(2,180);
  ss.getSheetByName('Люди').hideColumns(6);
  [slots,ss.getSheetByName('Люди'),status].forEach(s=>{
    s.getRange(1,1,1,s===slots?12:s===status?2:6).setBackground('#eeeeee').setFontWeight('bold');
    s.getDataRange().setFontFamily('Arial').setFontSize(10);
  });
  writeStatus_('Ожидает регистрации ключа');
  console.log('KEY_HASH='+hash_(p.getProperty('RP_KEY')));
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('RedParty')
    .addItem('Обновить сейчас','syncNow').addItem('Включить обновление','installAutoRefresh')
    .addItem('Остановить обновление','stopAutoRefresh').addToUi();
}
function syncNow() { return sync_(true); }
function redpartyTick() { return sync_(false); }
function installAutoRefresh() {
  const p=PropertiesService.getScriptProperties();
  if (!p.getProperty('RP_CURSOR')) throw new Error('Сначала выполните syncNow и проверьте загрузку.');
  if (!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='redpartyTick')) {
    ScriptApp.newTrigger('redpartyTick').timeBased().everyMinutes(1).create();
  }
  p.setProperty('RP_ENABLED','1'); writeStatus_('Работает');
}
function stopAutoRefresh() {
  PropertiesService.getScriptProperties().setProperty('RP_ENABLED','0');
  writeStatus_('Автообновление остановлено');
}
function verifyV1() {
  const ctx={calls:0,bytes:0};
  const b=request_('v1/schedule?date='+RP_.date+'&days=1',ctx);
  if (b.api_version!=='1' || !Array.isArray(b.days)) throw new Error('Некорректный ответ v1');
  console.log(JSON.stringify({version:b.api_version,slots:b.slots_count,http_status:200}));
}
function syncNowStatus() {
  syncNow();
  console.log('STATUS='+SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Синхронизация')
    .getRange('B2:B14').getDisplayValues().map((r,i)=>[i+2,r[0]])
    .filter(x=>![3,4,12].includes(x[0])).map(x=>x.join(':')).join(' | '));
}

function sync_(manual) {
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  const p=PropertiesService.getScriptProperties(), ctx={calls:0,bytes:0};
  try {
    const now=Date.now();
    if (!manual && (p.getProperty('RP_ENABLED')!=='1' || now<Number(p.getProperty('RP_NEXT')||0)
      || now-Number(p.getProperty('RP_SUCCESS')||0)<RP_.intervalMs)) return;
    let packet;
    try { packet=fetchBatch_(p.getProperty('RP_CURSOR'),ctx); }
    catch(e) {
      if (e.http!==410) throw e;
      p.deleteProperty('RP_CURSOR');
      packet=fetchBatch_(null,ctx); // One explicit resync only.
    }
    if (packet.mode==='full' || packet.items.length) {
      const state=merge_(packet);
      writeStatus_('Обновление');
      writeData_(state,packet.mode==='full' ? packet.lines : null);
      SpreadsheetApp.flush();
      // Sheets has no multi-sheet transaction. Writes are idempotent; never
      // advance the checkpoint before ALL writes and flush have succeeded.
      p.setProperties({RP_PEOPLE:String(Object.keys(state.people).length),
        RP_SLOTS:String(Object.keys(state.cells).length),RP_CHANGE:String(Date.now())});
    }
    p.setProperties({RP_CURSOR:packet.cursor,RP_SUCCESS:String(Date.now()),RP_FAILS:'0',
      RP_NEXT:'0',RP_MODE:packet.mode,RP_ERROR:''});
    console.log(JSON.stringify({mode:packet.mode,items:packet.items.length,
      requests:ctx.calls,json_bytes:ctx.bytes}));
  } catch(e) {
    const failures=Number(p.getProperty('RP_FAILS')||0)+1;
    const delay=e.http===429 ? e.retry*1000 : Math.min(3600000,180000*Math.pow(2,Math.min(failures-1,5)));
    p.setProperties({RP_FAILS:String(failures),RP_NEXT:String(Date.now()+delay),
      RP_ERROR:e.http ? 'API HTTP '+e.http : 'Не удалось обновить данные; прежний курсор сохранён.'});
    if (e.http===401 || e.http===403) p.setProperty('RP_ENABLED','0');
    console.log('Обновление не завершено. HTTP '+(e.http||'—')+'. Курсор не продвинут.');
  } finally {
    if (ctx.calls) {
      p.setProperties({RP_CALLS:String(Number(p.getProperty('RP_CALLS')||0)+ctx.calls),
        RP_BYTES:String(Number(p.getProperty('RP_BYTES')||0)+ctx.bytes)});
      writeStatus_(p.getProperty('RP_ERROR') ? 'Ошибка обновления' : 'Работает');
    }
    lock.releaseLock();
  }
}

function fetchBatch_(cursor,ctx) {
  let path=cursor ? 'cursor='+encodeURIComponent(cursor) : 'date='+RP_.date+'&days='+RP_.days;
  let result=null, batch=null; const started=Date.now();
  for (let page=0;page<250;page++) {
    const b=request_('v2/schedule?'+path,ctx);
    if (b.api_version!=='2' || !['full','delta','unchanged'].includes(b.mode) || !Array.isArray(b.items))
      throw new Error('Неполный ответ API');
    if (!result) { result={mode:b.mode,items:[],lines:b.lines||[],cursor:null}; batch=b.batch_id||null; }
    if ((b.batch_id||null)!==batch || result.mode!==b.mode) throw new Error('Сменился пакет API');
    result.items=result.items.concat(b.items);
    if (!b.has_more) {
      if (!uuid_(b.cursor)) throw new Error('Нет финального курсора');
      result.cursor=b.cursor; return result;
    }
    if (b.cursor!==null || !uuid_(b.next_page) || Date.now()-started>240000)
      throw new Error('Пакет API не завершён');
    path='page='+encodeURIComponent(b.next_page);
  }
  throw new Error('Слишком много страниц API');
}
function request_(path,ctx) {
  const key=PropertiesService.getScriptProperties().getProperty('RP_KEY');
  if (!/^rp_[0-9a-f]{64}$/.test(key||'')) throw new Error('Ключ не настроен');
  const r=UrlFetchApp.fetch(RP_.base+path,{headers:{'X-API-Key':key},
    muteHttpExceptions:true,followRedirects:false});
  const text=r.getContentText();ctx.calls++;ctx.bytes+=Utilities.newBlob(text).getBytes().length;
  if (r.getResponseCode()!==200) {
    const e=new Error('API HTTP '+r.getResponseCode());e.http=r.getResponseCode();
    const h=r.getAllHeaders();e.retry=Math.max(1,Math.min(3600,Number(h['Retry-After']||h['retry-after']||60)));
    throw e;
  }
  try { return JSON.parse(text); } catch(e) { throw new Error('Некорректный JSON API'); }
}

function merge_(packet) {
  const ss=SpreadsheetApp.getActiveSpreadsheet(), people={}, cells={};
  if (packet.mode!=='full') {
    data_(ss.getSheetByName('Люди'),6).forEach(r=>{if(r[5]) people[r[5]]={name:r[0],discord_id:String(r[1]),mark:{text:r[2],background:r[3],foreground:r[4]}};});
    data_(ss.getSheetByName('Слоты')||ss.getSheetByName('Расписание'),12).forEach(r=>{
      if(!r[10])return;
      const date=r[0] instanceof Date ? Utilities.formatDate(r[0],'Europe/Minsk','yyyy-MM-dd') : String(r[0]);
      const cell={date:date,line_id:String(r[10]),half:Number(r[11]),state:{person_id:String(r[9]),tables:r[8]===''?null:Number(r[8])}};
      cells[address_(cell)]=cell;
    });
  }
  packet.items.forEach(item=>{
    if (item.type==='person' && uuid_(item.id)) {
      if (item.state===null) delete people[item.id]; else people[item.id]=item.state;
    } else if (item.type==='cell' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
      typeof item.line_id==='string' && Number.isInteger(item.half) && item.half>=0 && item.half<48) {
      if (item.state===null) delete cells[address_(item)]; else cells[address_(item)]=item;
    } else throw new Error('Неизвестная запись API');
  });
  Object.values(cells).forEach(c=>{if(!people[c.state.person_id])throw new Error('Нет владельца клетки');});
  return {people:people,cells:cells};
}
function writeData_(state,newLines) {
  const p=PropertiesService.getScriptProperties(), ss=SpreadsheetApp.getActiveSpreadsheet();
  if (newLines) {
    if (newLines.length>1000) throw new Error('Слишком много линий');
    const lineProps={};newLines.forEach(l=>{lineProps['RP_LINE_'+l.id]=JSON.stringify(l);});p.setProperties(lineProps);
  }
  const props=p.getProperties();
  const peopleRows=Object.entries(state.people).sort((a,b)=>a[1].name.localeCompare(b[1].name,'ru')).map(([id,x])=>
    [safe_(x.name),safe_(x.discord_id),safe_(x.mark.text),safe_(x.mark.background),safe_(x.mark.foreground),id]);
  const slotRows=Object.values(state.cells).map(c=>{
    const line=JSON.parse(props['RP_LINE_'+c.line_id]||'null'),person=state.people[c.state.person_id];
    if(!line)throw new Error('Нет описания линии');
    return [new Date(c.date+'T12:00:00Z'),line.variant,line.limit,line.number,c.half/48,(c.half+1)/48,
      safe_(person.name),safe_(person.mark.text),c.state.tables===null?'':c.state.tables,c.state.person_id,c.line_id,c.half];
  }).sort((a,b)=>a[0]-b[0] || a[1].localeCompare(b[1]) || Number(a[2])-Number(b[2]) || a[3]-b[3] || a[11]-b[11]);
  replace_(ss.getSheetByName('Люди'),peopleRows,6);
  const slotSheet=ss.getSheetByName('Слоты')||ss.getSheetByName('Расписание');
  replace_(slotSheet,slotRows,12);
  if(slotRows.length) {
    const s=slotSheet;s.getRange(2,1,slotRows.length,1).setNumberFormat('yyyy-mm-dd');
    s.getRange(2,5,slotRows.length,2).setNumberFormat('[hh]:mm');
    s.getRange(2,4,slotRows.length,1).setNumberFormat('0');s.getRange(2,9,slotRows.length,1).setNumberFormat('0');
  }
  if(ss.getSheetByName('Слоты')) renderCalendar_(state);
}
function replace_(sheet,rows,columns) {
  const old=sheet.getLastRow();
  if(rows.length+1>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),rows.length+1-sheet.getMaxRows());
  if(rows.length)sheet.getRange(2,1,rows.length,columns).setNumberFormat('@').setValues(rows);
  if(old>rows.length+1)sheet.getRange(rows.length+2,1,old-rows.length-1,columns).clearContent();
  const filter=sheet.getFilter();if(filter)filter.remove();
  if(rows.length)sheet.getRange(1,1,rows.length+1,columns).createFilter();
}
function data_(sheet,columns) {return sheet.getLastRow()>1 ? sheet.getRange(2,1,sheet.getLastRow()-1,columns).getValues() : [];}
function ensureHeader_(sheet,headers) {
  if(sheet.getLastRow()>0 && JSON.stringify(sheet.getRange(1,1,1,headers.length).getValues()[0])!==JSON.stringify(headers))
    throw new Error('Неожиданные заголовки листа '+sheet.getName());
  sheet.getRange(1,1,1,headers.length).setValues([headers]);sheet.setFrozenRows(1);
}
function writeStatus_(label) {
  const p=PropertiesService.getScriptProperties(),s=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Синхронизация');
  s.getRange('B2:B14').setValues([[label],['Ноябрь 2026'],['Europe/Madrid'],
    [p.getProperty('RP_SUCCESS')?new Date(Number(p.getProperty('RP_SUCCESS'))):''],
    [p.getProperty('RP_CHANGE')?new Date(Number(p.getProperty('RP_CHANGE'))):''],[p.getProperty('RP_MODE')||''],
    [p.getProperty('RP_PEOPLE')||''],[p.getProperty('RP_SLOTS')||''],[Number(p.getProperty('RP_CALLS')||0)],
    [Number(p.getProperty('RP_BYTES')||0)],[RP_.base+'v2/schedule'],
    [p.getProperty('RP_ENABLED')==='1'?'Примерно раз в 3 минуты':'Не включено'],[p.getProperty('RP_ERROR')||'']]);
  s.getRange('B5:B6').setNumberFormat('dd.MM.yyyy HH:mm:ss');
}
function safe_(value) { const s=value==null?'':String(value);return /^[=+\-@\t\r]/.test(s)?"'"+s:s; }
function uuid_(s) {return typeof s==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);}
function address_(c) {return c.date+'|'+c.line_id+'|'+c.half;}
function hash_(s) {return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');}

// Presentation only: the normalized API state remains in the hidden Slots sheet.
function setupCalendar() {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1000)) throw new Error('Идёт синхронизация. Повторите после её завершения.');
  try {
    const ss=SpreadsheetApp.getActiveSpreadsheet();
    if(!ss.getSheetByName('Слоты')) {
      const source=ss.getSheetByName('Расписание');
      if(!source || source.getRange('A1').getValue()!=='Дата') throw new Error('Не найден исходный список слотов');
      source.setName('Слоты');
    }
    renderCalendar_(merge_({mode:'delta',items:[]}));
    ss.setActiveSheet(ss.getSheetByName('Расписание'));ss.moveActiveSheet(1);
    ss.getSheetByName('Слоты').hideSheet();SpreadsheetApp.flush();
    console.log('Календарная сетка создана из сохранённых данных; API не запрашивался.');
  } finally {lock.releaseLock();}
}
function calendarModel_(state,lines,date,days) {
  const used=new Set(Object.values(state.cells).map(c=>c.line_id));
  const active=lines.filter(l=>used.has(l.id)).sort((a,b)=>String(a.variant).localeCompare(String(b.variant)) ||
    Number(a.limit)-Number(b.limit) || a.number-b.number || a.id.localeCompare(b.id));
  const values=[],backgrounds=[],foregrounds=[],notes=[];
  const weekdays=['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
  for(let d=0;d<days;d++) {
    const dt=new Date(date+'T12:00:00Z');dt.setUTCDate(dt.getUTCDate()+d);
    const key=dt.toISOString().slice(0,10),label=key.slice(8)+', '+weekdays[dt.getUTCDay()];
    active.forEach((line,i)=>{
      const row=[i===0?label:'',String(line.variant),String(line.limit),String(line.number)];
      const bg=Array(52).fill('#ffffff'),fg=Array(52).fill('#202124'),nt=Array(52).fill('');
      for(let j=0;j<4;j++){bg[j]='#404040';fg[j]='#ffffff';}
      for(let half=0;half<48;half++) {
        const cell=state.cells[key+'|'+line.id+'|'+half];
        if(!cell){row.push('');continue;}
        const person=state.people[cell.state.person_id];
        if(!person)throw new Error('Нет человека для календаря');
        row.push(safe_(person.mark.text||person.name.slice(0,2)));
        bg[half+4]=/^#[0-9a-f]{6}$/i.test(person.mark.background)?person.mark.background:'#eeeeee';
        fg[half+4]=/^#[0-9a-f]{6}$/i.test(person.mark.foreground)?person.mark.foreground:'#202124';
        nt[half+4]=person.name+(cell.state.tables===null?'':' · Столы: '+cell.state.tables);
      }
      values.push(row);backgrounds.push(bg);foregrounds.push(fg);notes.push(nt);
    });
  }
  return {values,backgrounds,foregrounds,notes,linesPerDay:active.length};
}
function renderCalendar_(state) {
  const ss=SpreadsheetApp.getActiveSpreadsheet(),p=PropertiesService.getScriptProperties().getProperties();
  const lines=Object.keys(p).filter(k=>k.startsWith('RP_LINE_')).map(k=>JSON.parse(p[k]));
  const model=calendarModel_(state,lines,RP_.date,RP_.days);
  const s=ss.getSheetByName('Расписание')||ss.insertSheet('Расписание');
  const rows=Math.max(4,model.values.length+3),oldRows=s.getLastRow();
  if(s.getMaxColumns()<52)s.insertColumnsAfter(s.getMaxColumns(),52-s.getMaxColumns());
  if(s.getMaxRows()<rows)s.insertRowsAfter(s.getMaxRows(),rows-s.getMaxRows());
  s.getRange(1,1,Math.max(rows,oldRows),52).breakApart().clearContent().clearNote();
  const time=(half)=>String(Math.floor((half%48)/2)).padStart(2,'0')+':'+(half%2?'30':'00');
  const offset=(zone)=>{const z=Utilities.formatDate(new Date(RP_.date+'T12:00:00Z'),zone,'Z');
    return (z[0]==='-'?-1:1)*(Number(z.slice(1,3))*60+Number(z.slice(3,5)));};
  const shift=(offset('Europe/Minsk')-offset('Europe/Madrid'))/30;
  s.getRange(1,1,3,52).setValues([
    ['Расписание · '+RP_.date.slice(0,7),'','','',...Array.from({length:48},(_,h)=>h%2?'':time(h))],
    ['Минск (UTC+3)','','','',...Array.from({length:48},(_,h)=>time(h+shift))],
    ['День','Вариант','Лимит','Линия',...Array.from({length:48},(_,h)=>time(h))]
  ]);
  s.getRange(1,1,1,4).merge();s.getRange(2,1,1,4).merge();
  s.getRange(1,1,rows,52).setFontFamily('Arial').setFontSize(9).setHorizontalAlignment('center').setVerticalAlignment('middle');
  s.getRange(1,1,3,52).setBackground('#404040').setFontColor('#ffffff').setFontWeight('bold');
  s.getRange(3,1).setNote('Слоты по Europe/Madrid. Пустая клетка — нет занятого слота в API. Серые блокировки не выдумываются: v2 их не передаёт.');
  s.getRange(3,5,1,48).setBackground('#fff2cc').setFontColor('#202124');
  if(model.values.length) {
    s.getRange(4,1,model.values.length,52).setNumberFormat('@').setValues(model.values)
      .setBackgrounds(model.backgrounds).setFontColors(model.foregrounds).setNotes(model.notes);
    for(let day=0;day<RP_.days;day++) {
      const first=4+day*model.linesPerDay;
      s.getRange(first,1,model.linesPerDay,1).merge().setFontWeight('bold');
      s.getRange(first,1,1,52).setBorder(true,null,null,null,null,null,'#202124',SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    }
  }
  s.setFrozenRows(3);s.setFrozenColumns(4);s.setColumnWidth(1,82);s.setColumnWidth(2,65);
  s.setColumnWidth(3,48);s.setColumnWidth(4,40);s.setColumnWidths(5,48,34);s.setRowHeights(1,rows,22);
  s.setHiddenGridlines(false);
}
