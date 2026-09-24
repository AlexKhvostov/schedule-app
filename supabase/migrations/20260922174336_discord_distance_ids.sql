-- Discord id -> distance service id. Stamp members.distance_ext_id
-- without creating a club card for every snapshot row.

create table discord_distance_ids (
  discord_id text primary key,
  distance_ext_id text not null,
  constraint discord_distance_ids_shape
    check (distance_ext_id ~ '^[0-9]{1,12}$'),
  constraint discord_distance_ids_ext_uidx unique (distance_ext_id)
);

comment on table discord_distance_ids is
  'Discord snowflake to distance player id. Shown in admin and copied onto a member card when access is opened.';

alter table discord_distance_ids enable row level security;
grant select, insert, update, delete on discord_distance_ids to authenticated;
revoke all on discord_distance_ids from anon;

create policy discord_distance_ids_read on discord_distance_ids
  for select to authenticated using (true);

create policy discord_distance_ids_write on discord_distance_ids
  for all to authenticated
  using (is_staff())
  with check (is_staff());

insert into discord_distance_ids (discord_id, distance_ext_id) values
('406139198957944843', '101'),
('399474872524341258', '102'),
('277691871097257995', '103'),
('468146112662863883', '104'),
('382795215620145154', '105'),
('519682598826409994', '106'),
('590843479844716545', '107'),
('779032104414871602', '108'),
('624532345407668234', '109'),
('697150253207519324', '110'),
('721372881426186291', '111'),
('376302149161844749', '112'),
('381414058903207936', '113'),
('634349602539044865', '114'),
('431827098571898882', '115'),
('428916459058757637', '116'),
('459130377274130454', '117'),
('1279068816084701256', '118'),
('383309100727009282', '119'),
('694464598878978109', '120'),
('508624093529243648', '121'),
('734055908895752192', '122'),
('383948009928392708', '124'),
('379067986377572362', '125'),
('818840262717079572', '126'),
('388656275228983307', '127'),
('379299371860230144', '128'),
('935069958470262854', '129'),
('963457967435440129', '130'),
('735448129482260530', '131'),
('966650735154573324', '132'),
('556733500019965962', '133'),
('860808904295448586', '134'),
('1023289393592676394', '135'),
('725708368265609267', '136'),
('867111469078675506', '137'),
('339501673527508993', '138'),
('401813148908257281', '139'),
('822116644138254387', '140'),
('419143675013234698', '141'),
('882597033603633222', '142'),
('561684917835268145', '143'),
('450290903064510474', '144'),
('392950243186049046', '145'),
('422389314568192001', '321'),
('387235430707363852', '306'),
('422511666953977868', '148'),
('338365617772036096', '149'),
('317343009643560960', '150'),
('221958459547975680', '151'),
('608232166224166912', '152'),
('710464094884593725', '153'),
('344212497424842753', '154'),
('345655784547549204', '155'),
('779075869854662716', '156'),
('399124199957987328', '157'),
('206846831055994880', '158'),
('387185586005606410', '159'),
('1082276842196705300', '160'),
('365935591591772161', '161'),
('519411771904360449', '162'),
('494970374572736523', '163'),
('431879088408494080', '164'),
('471690600614330378', '166'),
('380072194111307776', '167'),
('635126917674041355', '168'),
('388806827707727883', '169'),
('898167016266010675', '170'),
('514152909802438659', '171'),
('667412780760170497', '172'),
('701343592014151782', '173'),
('376055686465060864', '174'),
('936522396482023454', '175'),
('436856521863856158', '176'),
('623984502854778882', '177'),
('1072904335748509787', '178'),
('491710265608372234', '180'),
('543409392003842078', '181'),
('720591450420543558', '182'),
('851766789528092692', '183'),
('1052951998468726805', '184'),
('183988916737671169', '185'),
('681544382465441807', '186'),
('319140983755374592', '188'),
('958832314245337088', '189'),
('381837928516681731', '191'),
('432576996103553035', '192'),
('865590989422460948', '193'),
('944990736745656320', '361'),
('374930606494318602', '195'),
('598644297121923083', '196'),
('746796224778338354', '197'),
('644818616105172994', '198'),
('779056338096357396', '199'),
('1256702898767663130', '200'),
('298875970390327299', '203'),
('564309010006671380', '206'),
('382291513297600512', '205'),
('211188613885591552', '207'),
('477519994419412994', '204'),
('646660275281461250', '208'),
('690668963511926855', '210'),
('317366497158627329', '213'),
('441879153868800001', '215'),
('312778757557452820', '219'),
('368884416618954765', '216'),
('1161063788188024914', '223'),
('238060246679945217', '224'),
('259854590139301899', '226'),
('275300924371501057', '227'),
('262975617476198401', '229'),
('467469225162702872', '230'),
('387036407773921301', '231'),
('285761350179749889', '220'),
('1052454285029412875', '236'),
('1245558209196986445', '209'),
('373449963394564097', '264'),
('803315798693249096', '242'),
('1201054776515887114', '263'),
('354991484786835456', '239'),
('381022552610308097', '234'),
('271310285707542528', '265'),
('442441236000014337', '233'),
('1065588349928231013', '267'),
('677912806460358666', '275'),
('882531120485371935', '165'),
('1384608719282765824', '257'),
('553503067686043650', '282'),
('416626618107428864', '268'),
('263126067164872714', '211'),
('530342214233227274', '248'),
('382975564614598656', '283'),
('1315344867999617139', '212'),
('380656053215297539', '299'),
('691007390140858380', '286'),
('501321312325861386', '280'),
('316077518102724618', '300'),
('271310307702472704', '293'),
('493527542926409735', '304'),
('779435649546715206', '312'),
('878187785327112202', '310'),
('468401226862690345', '240'),
('404490479867265035', '323'),
('143881043240288257', '327'),
('494860715492900865', '337'),
('532062325801353226', '346'),
('182908994552070144', '303'),
('818877209619333241', '341')
on conflict (discord_id) do update set distance_ext_id = excluded.distance_ext_id;


create or replace function set_discord_access(p_discord_id text, p_access text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  mid uuid;
  actor uuid;
  snap discord_members%rowtype;
  uname text;
  code text;
begin
  if not is_staff() then
    raise exception 'staff-only' using errcode = '42501';
  end if;
  if p_access not in ('closed', 'member', 'admin', 'staff') then
    raise exception 'bad-access';
  end if;

  actor := current_member_id();

  select i.member_id into mid
  from identities i
  where i.provider = 'discord'
    and i.provider_uid = p_discord_id;

  if p_access = 'closed' and mid is not null and exists (
    select 1 from member_roles where member_id = mid and role_id = 'root'
  ) then
    raise exception 'cannot-close-root';
  end if;

  if p_access = 'closed' and mid is not null and mid = actor then
    raise exception 'cannot-close-self';
  end if;

  if p_access = 'closed' then
    if mid is null then
      return null;
    end if;
    update members
    set access_status = 'blocked',
        approved_at = null
    where id = mid;
    delete from member_roles
    where member_id = mid
      and role_id in ('admin', 'staff');
    return mid;
  end if;

  if mid is null then
    select * into snap from discord_members where discord_id = p_discord_id;
    if not found or snap.bot then
      raise exception 'unknown-discord';
    end if;
    uname := coalesce(nullif(btrim(snap.guild_nick), ''), nullif(btrim(snap.global_name), ''), snap.username);
    loop
      code := 'RP-' || substr(md5(p_discord_id || clock_timestamp()::text), 1, 6);
      exit when not exists (select 1 from members where public_code = code);
    end loop;

    insert into members (auth_user_id, public_code, access_status, mark_tag, community_status, approved_at)
    values (null, code, 'active', null, 'club', now())
    returning id into mid;

    insert into profiles (member_id, display_name)
    values (mid, uname);

    insert into identities (
      member_id, provider, provider_uid, username, display_name, guild_nick, avatar_url, raw
    ) values (
      mid,
      'discord',
      p_discord_id,
      snap.username,
      snap.global_name,
      snap.guild_nick,
      snap.avatar_url,
      jsonb_build_object('source', 'admin-grant')
    );
  else
    update members
    set access_status = 'active',
        approved_at = coalesce(approved_at, now()),
        community_status = coalesce(community_status, 'club')
    where id = mid;
  end if;

  if p_access = 'staff' then
    insert into member_roles (member_id, role_id)
    values (mid, 'staff')
    on conflict do nothing;
    delete from member_roles
    where member_id = mid
      and role_id in ('member', 'admin');
  elsif p_access = 'admin' then
    insert into member_roles (member_id, role_id)
    values (mid, 'member')
    on conflict do nothing;
    insert into member_roles (member_id, role_id)
    values (mid, 'admin')
    on conflict do nothing;
    delete from member_roles
    where member_id = mid
      and role_id = 'staff';
  else
    insert into member_roles (member_id, role_id)
    values (mid, 'member')
    on conflict do nothing;
    delete from member_roles
    where member_id = mid
      and role_id in ('admin', 'staff');
  end if;

  update members m
  set distance_ext_id = d.distance_ext_id
  from discord_distance_ids d
  where m.id = mid
    and d.discord_id = p_discord_id
    and m.distance_ext_id is null;

  return mid;
end;
$$;

revoke all on function set_discord_access(text, text) from public;
grant execute on function set_discord_access(text, text) to authenticated;


alter table members disable trigger members_guard_distance_ext_id;

update members m
set distance_ext_id = d.distance_ext_id
from identities i
join discord_distance_ids d on d.discord_id = i.provider_uid
where i.provider = 'discord'
  and i.member_id = m.id
  and m.distance_ext_id is distinct from d.distance_ext_id;

alter table members enable trigger members_guard_distance_ext_id;
