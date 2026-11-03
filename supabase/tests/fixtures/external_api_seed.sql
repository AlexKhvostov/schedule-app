-- Synthetic fixtures. Apply only to a fresh disposable LOCAL database, in a transaction.
-- Read fixtures deliberately include blocked owners and missing cabinet limits:
-- these must not hide existing occupancy. Bypass write triggers ONLY while seeding.
set local session_replication_role = replica;
insert into members(id, public_code, access_status, mark_tag) values
 ('aaaaaaaa-0000-4000-8000-000000000001','API-TEST-1','blocked','XQ'),
 ('aaaaaaaa-0000-4000-8000-000000000002','API-TEST-2','active','YQ'),
 ('aaaaaaaa-0000-4000-8000-000000000003','API-TEST-3','active','ZQ');
insert into identities(member_id,provider,provider_uid,username) values
 ('aaaaaaaa-0000-4000-8000-000000000001','discord','123456789012345678','old_user');
insert into discord_members(discord_id,username,guild_nick,global_name) values
 ('123456789012345678','current_user','GuildNick','GlobalName');
insert into profiles(member_id,display_name) values
 ('aaaaaaaa-0000-4000-8000-000000000001','ProfileName');
insert into players(id,member_id,room_id)
 select 'aaaaaaaa-0000-4000-8000-000000000010','aaaaaaaa-0000-4000-8000-000000000001',id from rooms where slug='winamax';
insert into player_nicks(player_id,nick,at) values
 ('aaaaaaaa-0000-4000-8000-000000000010','PreviousNick','2098-01-01'),
 ('aaaaaaaa-0000-4000-8000-000000000010','CurrentNick','2098-02-01');
insert into occupancy(member_id,kind_id,slot_date,half,level,tables)
 select 'aaaaaaaa-0000-4000-8000-000000000001',k.id,date '2098-11-01' + d,h,0,3
 from schedule_kinds k join rooms r on r.id=k.room_id and r.slug='winamax'
 cross join generate_series(0,22) d cross join generate_series(0,47) h
 where k.variant_id='nitro' and k.limit_id='50';
insert into occupancy(member_id,kind_id,slot_date,half,level,tables)
 select 'aaaaaaaa-0000-4000-8000-000000000002',k.id,date '2098-11-01',36,0,2
 from schedule_kinds k join rooms r on r.id=k.room_id and r.slug='winamax'
 where k.variant_id='regular' and k.limit_id='50';
insert into occupancy(member_id,kind_id,slot_date,half,level,tables)
 select 'aaaaaaaa-0000-4000-8000-000000000003',k.id,date '2098-11-01',36,1,1
 from schedule_kinds k join rooms r on r.id=k.room_id and r.slug='winamax'
 where k.variant_id='nitro' and k.limit_id='25';
update schedule_settings set count_tables=false;
set local session_replication_role = origin;

insert into external_api_private.clients(name,key_hash,requests_per_minute) values
 ('test', repeat('a',64),600), ('quota',repeat('b',64),2);
insert into external_api_private.clients(name,key_hash,scopes) values ('no-scope',repeat('c',64),'{}');
insert into external_api_private.clients(name,key_hash,revoked_at) values ('revoked',repeat('d',64),now());
insert into external_api_private.clients(name,key_hash,expires_at) values ('expired',repeat('e',64),now()-interval '1 second');
