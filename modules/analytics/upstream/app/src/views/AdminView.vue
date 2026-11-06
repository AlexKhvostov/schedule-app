<template>
  <section class="page admin-page">
    <!-- Вход -->
    <div v-if="!authed" class="login-wrap">
      <div class="login-card card">
        <h1>Вход в админку</h1>
        <p class="muted lead">
          Сборные таблицы и ручной пересчёт. Пароль — в
          <span class="code">v2/analytics/.env</span>
          (<span class="code">ANALYTICS_ADMIN_PASSWORD</span>).
        </p>

        <p v-if="!configured" class="bad box">
          Пароль ещё не задан. Добавьте <span class="code">ANALYTICS_ADMIN_PASSWORD=…</span> в .env и перезапустите API.
        </p>

        <form v-else class="login-form" @submit.prevent="doLogin">
          <label>
            <span>Пароль администратора</span>
            <input
              v-model="password"
              type="password"
              autocomplete="current-password"
              :disabled="locked || loginBusy"
              placeholder="••••••••"
            />
          </label>

          <p v-if="locked" class="warn box">
            Ввод заморожен после 3 неверных попыток.
            Подождите ещё {{ lockHuman }}.
          </p>
          <p v-else-if="loginError" class="bad box">{{ loginError }}</p>
          <p v-else-if="attemptsLeft < 3" class="warn box">
            Осталось попыток: {{ attemptsLeft }}
          </p>

          <button type="submit" class="primary" :disabled="locked || loginBusy || !password">
            {{ loginBusy ? 'Проверяем…' : 'Войти' }}
          </button>
        </form>
      </div>
    </div>

    <!-- Каталог -->
    <template v-else>
      <header class="page-head">
        <div>
          <h1>Сборные таблицы</h1>
          <p class="lead">
            Агрегаты без ников в строках. Сейчас — ручной запуск; позже cron.
          </p>
        </div>
        <div class="head-actions">
          <button type="button" class="ghost compact" :disabled="loading" @click="load">Обновить список</button>
          <button type="button" class="ghost compact" @click="doLogout">Выйти</button>
        </div>
      </header>

      <p v-if="error" class="bad box">{{ error }}</p>
      <LoadingBox v-if="loading && !tables.length" text="Загружаем каталог…" />

      <!-- Прогресс длинных джоб (по дням) -->
      <div v-if="jobProg.active" class="job-prog card" role="status" aria-live="polite">
        <div class="job-prog-top">
          <div>
            <strong>{{ jobProg.title }}</strong>
            <span class="muted"> · {{ jobProg.done }}/{{ jobProg.total }}</span>
            <span v-if="jobProg.day" class="code"> · {{ jobProg.day }}</span>
          </div>
          <div class="job-prog-actions">
            <span class="job-pct">{{ jobProg.pct }}%</span>
            <button
              v-if="!jobProg.stop"
              type="button"
              class="ghost compact"
              @click="requestJobStop"
            >Стоп</button>
            <span v-else class="muted small">остановка…</span>
          </div>
        </div>
        <div class="job-bar"><div class="job-fill" :style="{ width: jobProg.pct + '%' }" /></div>
        <p class="muted small job-line">{{ jobProg.line }}</p>
      </div>

      <div class="cards">
        <template v-for="(t, idx) in tables" :key="t.id">
          <h2 v-if="idx === 0" class="cat-section">Конвейер агрегатов</h2>
          <h2
            v-else-if="t.group === 'ops' && tables[idx - 1]?.group !== 'ops'"
            class="cat-section ops"
          >Инфраструктура · простой сервера</h2>

          <article
            class="agg-card card"
            :class="{
              planned: t.status === 'planned',
              'has-open-ctrl': tabOf(t) === 'control',
              'ops-card': t.group === 'ops'
            }"
          >
          <header class="agg-head">
            <div>
              <div class="agg-num muted">
                {{ t.group === 'ops' ? 'Ops' : `Таблица ${pipelineIndex(t)}` }}
              </div>
              <button type="button" class="title-btn" @click="openDetail(t.id)">
                {{ t.title }}
              </button>
              <div class="code muted">{{ t.tableName }}</div>
            </div>
            <span class="pill" :class="t.status">{{ statusLabel(t.status) }}</span>
          </header>

          <nav class="agg-tabs" aria-label="Разделы таблицы">
            <button
              type="button"
              :class="{ on: tabOf(t) === 'stats' }"
              @click="setTab(t, 'stats')"
            >1. Статистика</button>
            <button
              v-if="t.hasControl"
              type="button"
              :class="{ on: tabOf(t) === 'control' }"
              @click="setTab(t, 'control')"
            >2. Контроль</button>
            <button
              type="button"
              :class="{ on: tabOf(t) === 'update' }"
              :disabled="!t.canRun"
              @click="setTab(t, 'update')"
            >3. Обновление</button>
          </nav>

          <!-- 1. Статистика -->
          <div v-show="tabOf(t) === 'stats'" class="agg-pane">
            <p class="agg-short">{{ t.short }}</p>
            <dl class="agg-meta">
              <div>
                <dt>Последний запуск</dt>
                <dd>
                  <template v-if="t.lastRun">
                    <span :class="['run-status', t.lastRun.status]">{{ t.lastRun.status }}</span>
                    <span class="muted"> · {{ formatUtc(t.lastRun.finishedAt || t.lastRun.startedAt) }}</span>
                  </template>
                  <span v-else class="muted">ещё не запускали</span>
                </dd>
              </div>
              <div>
                <dt>Данные в таблице</dt>
                <dd>
                  <template v-if="t.stats">
                    {{ t.stats.rowCount }} стр.
                    <span v-if="t.stats.minDay" class="muted">
                      · {{ t.stats.minDay }} → {{ t.stats.maxDay }}
                    </span>
                  </template>
                  <span v-else class="muted">—</span>
                </dd>
              </div>
            </dl>
            <p v-if="t.lastRun?.message" class="muted small run-msg">{{ t.lastRun.message }}</p>
            <footer class="agg-actions">
              <button type="button" class="ghost compact" @click="openDetail(t.id)">Описание</button>
              <button
                type="button"
                class="ghost compact"
                :disabled="t.status !== 'ready' || rowsBusy === t.id"
                @click="openRows(t)"
              >{{ rowsBusy === t.id ? '…' : 'Последние 100' }}</button>
            </footer>
          </div>

          <!-- 2. Контроль: player_hour -->
          <div v-show="tabOf(t) === 'control' && t.id === 'player_hour'" class="agg-pane ctrl-pane">
            <p class="ph-note muted small">
              Статус агрегата по дням. Часы простоя смотрите в карточке
              <strong>Часы сбора (downtime)</strong> — здесь их не дублируем.
              Дефолтный диапазон с <span class="code">2026-04-01</span> (начало ваших данных).
            </p>

            <!-- Диапазон отчёта -->
            <div class="ctrl-block-box">
              <h3 class="ctrl-h">Диапазон отчёта</h3>
              <div class="ph-controls">
                <label>
                  С
                  <input v-model="phFrom" type="date" />
                </label>
                <label>
                  По
                  <input v-model="phTo" type="date" />
                </label>
                <button type="button" class="primary compact" :disabled="phLoading" @click="loadCoverage">
                  {{ phLoading ? '…' : 'Показать отчёт' }}
                </button>
              </div>
              <div class="ph-controls">
                <button
                  type="button"
                  class="ghost compact"
                  :disabled="phBusy && !phFilling"
                  @click="fillEmptyDays"
                >{{ phFilling ? 'Стоп заполнения' : 'Заполнить пустые / неполные / no_data' }}</button>
                <button
                  type="button"
                  class="ghost compact"
                  :disabled="(phBusy || jobProg.active) && runningId !== 'player_hour'"
                  @click="runningId === 'player_hour' ? requestJobStop() : runPlayerHourRange()"
                >{{ runningId === 'player_hour' ? (jobProg.stop ? 'Остановка…' : 'Стоп пересборки') : 'Пересобрать весь диапазон' }}</button>
              </div>
              <p class="ph-note muted small">
                Обновление за сегодня и авто-тикер — во вкладке <strong>Обновление</strong>.
              </p>
            </div>

            <div v-if="phSummary" class="ph-summary">
              <div class="kpi-mini"><span class="lab">Дней</span><strong>{{ phSummary.totalDays }}</strong></div>
              <div class="kpi-mini ok"><span class="lab">Готово</span><strong>{{ phSummary.ok }}</strong></div>
              <div class="kpi-mini warn"><span class="lab">Неполно</span><strong>{{ phSummary.partial }}</strong></div>
              <div class="kpi-mini subset"><span class="lab">Лимиты</span><strong>{{ phSummary.subset || 0 }}</strong></div>
              <div class="kpi-mini today"><span class="lab">Сегодня</span><strong>{{ phSummary.today || 0 }}</strong></div>
              <div class="kpi-mini bad"><span class="lab">Пусто</span><strong>{{ phSummary.empty }}</strong></div>
              <div class="kpi-mini nodata"><span class="lab">Нет данных</span><strong>{{ phSummary.noData || 0 }}</strong></div>
              <div class="kpi-mini"><span class="lab">Строк</span><strong>{{ phSummary.tableRows }}</strong></div>
            </div>
            <p v-if="phSummary?.scrapeMissingDays" class="warn box small">
              У {{ phSummary.scrapeMissingDays }} дн. в отчёте ещё нет строк
              <span class="code">scrape_hour</span> (часы сбора). Это нормально после очистки:
              появятся при сборке player_hour по дням/неделям, либо быстрее — «Пересобрать диапазон»
              на карточке «Часы сбора».
            </p>

            <div v-if="phCal.weeks.length" class="gh-wrap">
              <div
                class="gh-months"
                :style="{ gridTemplateColumns: `repeat(${phCal.weeks.length}, 12px)` }"
              >
                <span
                  v-for="m in phCal.months"
                  :key="m.key"
                  class="gh-month"
                  :style="{ gridColumn: `${m.col} / span ${m.span}` }"
                >{{ m.label }}</span>
              </div>
              <div class="gh-body">
                <div class="gh-wdays">
                  <span v-for="(w, i) in phCal.wdLabels" :key="i" class="gh-wday">{{ w }}</span>
                </div>
                <div class="gh-weeks">
                  <div v-for="(week, wi) in phCal.weeks" :key="wi" class="gh-week">
                    <button
                      v-for="(cell, ci) in week"
                      :key="ci"
                      type="button"
                      class="gh-cell"
                      :class="[
                        'lv-' + cell.level,
                        cell.status,
                        { pad: cell.pad, sel: cell.day && cell.day === phOneDay }
                      ]"
                      :disabled="cell.pad || !cell.day"
                      :title="cellTip(cell)"
                      @click="onCalClick(cell)"
                    />
                  </div>
                </div>
              </div>
              <div class="gh-legend">
                <span class="muted">Меньше</span>
                <i class="gh-cell lv-0" />
                <i class="gh-cell lv-1" />
                <i class="gh-cell lv-2" />
                <i class="gh-cell lv-3" />
                <i class="gh-cell lv-4" />
                <span class="muted">Больше</span>
                <span class="gh-leg-gap" />
                <i class="gh-cell lv-0 empty" />
                <span class="muted">пусто</span>
                <i class="gh-cell lv-2 partial" />
                <span class="muted">неполно</span>
                <i class="gh-cell lv-2 subset" />
                <span class="muted">лимиты</span>
                <i class="gh-cell lv-2 today" />
                <span class="muted">сегодня</span>
                <i class="gh-cell lv-0 no_data" />
                <span class="muted">нет данных</span>
              </div>
            </div>

            <div v-if="phHover" class="gh-tip card">
              <strong>{{ phHover.day }}</strong>
              · {{ phStatusLabel(phHover.status) }}
              · строк: {{ phHover.rowCount }}
              · игроков: {{ phHover.players }}
              <template v-if="phHover.sourceSnapshots != null">
                · сырьё: {{ phHover.sourceSnapshots }}
              </template>
              <div v-if="phHover.limitFlags" class="lim-row tip-lim">
                <span class="muted">Лимиты:</span>
                <span
                  v-for="lim in (phHover.limits || phLimits)"
                  :key="lim"
                  class="lim-chip"
                  :class="limitChipClass(phHover.limitFlags[lim])"
                  :title="limitChipTitle(lim, phHover.limitFlags[lim])"
                >{{ limitShort(lim) }}</span>
              </div>
              <span v-if="phHover.note" class="muted">{{ phHover.note }}</span>
              <button
                type="button"
                class="ghost compact"
                :disabled="phBusy"
                @click="runOneDay(phHover.day)"
              >{{ phHover.status === 'no_data' ? 'Перепроверить' : 'Собрать этот день' }}</button>
            </div>

            <p v-if="phMsg" class="muted small">{{ phMsg }}</p>
            <p v-if="phError" class="bad box">{{ phError }}</p>

            <div class="ph-table-wrap">
              <table class="ph-table">
                <thead>
                  <tr>
                    <th>День</th>
                    <th>Статус</th>
                    <th>Лимиты</th>
                    <th>Игроков</th>
                    <th>Сырьё</th>
                    <th>Последний сбор</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="d in phDays" :key="d.day" :class="['st-' + d.status, { active: phBusyDay === d.day }]">
                    <td class="code">{{ d.day }}</td>
                    <td>
                      <span class="pill-sm" :class="d.status">{{ phStatusLabel(d.status) }}</span>
                      <div v-if="d.note" class="row-note muted">{{ d.note }}</div>
                    </td>
                    <td>
                      <div class="lim-row">
                        <span
                          v-for="lim in (d.limits || phLimits)"
                          :key="lim"
                          class="lim-chip"
                          :class="limitChipClass(d.limitFlags?.[lim])"
                          :title="limitChipTitle(lim, d.limitFlags?.[lim])"
                        >{{ limitShort(lim) }}</span>
                      </div>
                    </td>
                    <td>{{ d.players }}</td>
                    <td class="muted">{{ d.sourceSnapshots == null ? '—' : d.sourceSnapshots }}</td>
                    <td class="muted small nowrap" :title="d.computedAt || ''">
                      {{ formatUtcShort(d.computedAt) }}
                    </td>
                    <td>
                      <button
                        type="button"
                        class="ghost compact"
                        :disabled="phBusy"
                        @click="runOneDay(d.day)"
                      >{{ phBusyDay === d.day ? '…' : (d.status === 'no_data' ? 'Проверить' : 'Собрать') }}</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- 2. Контроль: hour_slice -->
          <div v-show="tabOf(t) === 'control' && t.id === 'hour_slice'" class="agg-pane ctrl-pane">
            <p class="muted small">
              Отдельный контроль среза появится после стабилизации шага 1.
              Сейчас полноту суток и дыры часов смотрите в
              <strong>Почасовой max игрока → 2. Контроль</strong>.
              Простой сервера по часам — в <strong>Часы сбора (downtime)</strong>.
            </p>
          </div>

          <!-- 2. Контроль: scrape_hour — heatmap day × hour -->
          <div v-show="tabOf(t) === 'control' && t.id === 'scrape_hour'" class="agg-pane ctrl-pane">
            <p class="ph-note muted small">
              <strong>Heatmap (тепловая карта)</strong> день × час — как contribution graph на GitHub,
              но оси: <em>строки = дни</em>, <em>столбцы = часы 0–23</em> (Europe/Madrid).
              Красный (<span class="code">down</span>) — час уже прошёл, снимков 0 (в т.ч. целые сутки простоя).
              Серый (<span class="code">missing</span>) — только будущие часы сегодня / ещё не наступили.
              Если целый день без сырья не пересчитывали — нажмите «Пересобрать диапазон», чтобы записать 24× down в таблицу.
            </p>

            <div class="ctrl-block-box">
              <h3 class="ctrl-h">Диапазон</h3>
              <div class="ph-controls">
                <label>С <input v-model="scFrom" type="date" /></label>
                <label>По <input v-model="scTo" type="date" /></label>
                <button type="button" class="primary compact" :disabled="scLoading" @click="loadScrapeCoverage">
                  {{ scLoading ? '…' : 'Показать heatmap' }}
                </button>
                <button
                  type="button"
                  class="ghost compact"
                  :disabled="jobProg.active && runningId !== 'scrape_hour'"
                  @click="runningId === 'scrape_hour' ? requestJobStop() : runScrapeRange()"
                >{{ runningId === 'scrape_hour' ? (jobProg.stop ? 'Остановка…' : 'Стоп') : 'Пересобрать диапазон' }}</button>
              </div>
            </div>

            <div v-if="scSummary" class="ph-summary">
              <div class="kpi-mini ok"><span class="lab">ok</span><strong>{{ scSummary.ok }}</strong></div>
              <div class="kpi-mini bad"><span class="lab">down</span><strong>{{ scSummary.down }}</strong></div>
              <div class="kpi-mini today"><span class="lab">pending</span><strong>{{ scSummary.pending }}</strong></div>
              <div class="kpi-mini nodata"><span class="lab">missing</span><strong>{{ scSummary.missing }}</strong></div>
              <div class="kpi-mini"><span class="lab">Дней</span><strong>{{ scSummary.totalDays }}</strong></div>
            </div>

            <div v-if="scRows.length" class="hm-wrap">
              <div class="hm-head">
                <span class="hm-corner" />
                <span class="hm-day-lab" />
                <div class="hm-hours">
                  <span v-for="h in 24" :key="'hh'+h" class="hm-h">{{ h - 1 }}</span>
                </div>
              </div>
              <div
                v-for="row in scRows"
                :key="row.day"
                class="hm-row"
              >
                <span class="hm-month">{{ row.monthLabel }}</span>
                <span class="hm-day code">{{ row.dayShort }}</span>
                <div class="hm-hours">
                  <i
                    v-for="cell in row.hours"
                    :key="row.day + '-' + cell.hour"
                    class="hm-cell"
                    :class="'st-' + cell.status"
                    :title="`${row.day} ${String(cell.hour).padStart(2,'0')}:00 — ${cell.status}${cell.count ? ' · ' + cell.count : ''}`"
                  />
                </div>
              </div>
              <div class="hm-legend">
                <i class="hm-cell st-ok" /> <span class="muted">ok — есть сбор</span>
                <i class="hm-cell st-down" /> <span class="muted">down — нет сбора (час или весь день)</span>
                <i class="hm-cell st-pending" /> <span class="muted">pending — час ещё не наступил</span>
                <i class="hm-cell st-missing" /> <span class="muted">missing — будущее / не наступило</span>
              </div>
            </div>
            <p v-if="scError" class="bad box">{{ scError }}</p>
            <p v-if="scMsg" class="muted small">{{ scMsg }}</p>
          </div>

          <!-- 3. Обновление -->
          <div v-show="tabOf(t) === 'update'" class="agg-pane">
            <template v-if="t.id === 'player_hour'">
              <p class="muted small">
                Пересчёт агрегата <span class="code">player_hour</span> (и scrape_hour) из снимков.
                Тикер живёт на Render-скрапере и каждую минуту спрашивает API; интервал ниже — с какой частотой реально считать.
              </p>

              <div class="ctrl-block-box">
                <h3 class="ctrl-h">Сегодня (Europe/Madrid)</h3>
                <div class="ph-controls">
                  <button
                    type="button"
                    class="primary compact"
                    :disabled="phBusy || !phTodayEs"
                    @click="runOneDay(phTodayEs)"
                  >{{ phBusyDay === phTodayEs ? 'Считаем…' : `Обновить сегодня (${phTodayEs})` }}</button>
                  <button
                    type="button"
                    class="ghost compact"
                    :disabled="phBusy || !phSummary?.nextEmpty"
                    @click="runOneDay(phSummary.nextEmpty)"
                  >След. пустой ({{ phSummary?.nextEmpty || '—' }})</button>
                </div>
              </div>

              <div class="ctrl-block-box">
                <h3 class="ctrl-h">Один день</h3>
                <div class="ph-controls">
                  <label>День <input v-model="phOneDay" type="date" /></label>
                  <button
                    type="button"
                    class="primary compact"
                    :disabled="phBusy || !phOneDay"
                    @click="runOneDay(phOneDay)"
                  >{{ phBusyDay === phOneDay ? 'Считаем…' : 'Обновить день' }}</button>
                </div>
              </div>

              <div class="ctrl-block-box">
                <h3 class="ctrl-h">Авто: сегодня ES</h3>
                <p class="ph-note muted small">
                  Минимум — <strong>1 минута</strong>. Тикер на <strong>Render</strong> стучится каждую минуту;
                  PHP запускает пересчёт только если прошло ≥ интервала и авто включено.
                  Нужны env на Render: <span class="code">ANALYTICS_API_BASE_URL</span>=
                  <span class="code">http://dashboard.redparty.ru/</span> и
                  <span class="code">ANALYTICS_CRON_SECRET</span> (= секрет Hostland analytics).
                  Без этих двух переменных настройка в админке сохраняется, но пересчёт сам не стартует.
                </p>
                <div class="ph-controls ph-sched">
                  <label class="ph-sched-check">
                    <input v-model="phSchedEnabled" type="checkbox" />
                    Включено
                  </label>
                  <label>
                    Каждые (мин)
                    <input
                      v-model.number="phSchedMinutes"
                      type="number"
                      min="1"
                      max="1440"
                      step="1"
                      class="ph-sched-min"
                    />
                  </label>
                  <button
                    type="button"
                    class="primary compact"
                    :disabled="phSchedSaving"
                    @click="savePlayerHourSchedule"
                  >{{ phSchedSaving ? 'Сохраняем…' : 'Сохранить' }}</button>
                  <button
                    type="button"
                    class="ghost compact"
                    :disabled="phSchedLoading"
                    @click="loadPlayerHourSchedule"
                  >Обновить статус</button>
                </div>
                <p v-if="phSchedError" class="bad small">{{ phSchedError }}</p>
                <p v-else-if="phSchedMsg" class="ok small">{{ phSchedMsg }}</p>
                <p v-if="phSchedStale" class="bad small">
                  ⚠️ Тикер давно не доходил: последний авто-запуск старше {{ phSchedMinutes }}×2 мин.
                  Проверьте env на Render и перезапуск сервиса. Пока можно жать
                  «Обновить сегодня» вручную.
                </p>
                <dl class="ph-sched-meta muted small">
                  <div>
                    <dt>Последний авто-запуск</dt>
                    <dd>
                      <template v-if="phSched?.lastRunAt">
                        {{ phSched.lastRunAt }} UTC
                        <span :class="phSched.lastStatus === 'ok' ? 'ok' : 'bad'">
                          · {{ phSched.lastStatus || '—' }}
                        </span>
                      </template>
                      <template v-else>—</template>
                    </dd>
                  </div>
                  <div v-if="phSched?.lastMessage">
                    <dt>Сообщение</dt>
                    <dd>{{ phSched.lastMessage }}</dd>
                  </div>
                  <div>
                    <dt>Следующий (оценка)</dt>
                    <dd>{{ phSchedNextRunAt || (phSchedEnabled ? 'скоро' : 'выключено') }}</dd>
                  </div>
                  <div>
                    <dt>Секрет на API</dt>
                    <dd :class="phSchedCronOk ? 'ok' : 'warn'">
                      {{ phSchedCronOk ? 'ANALYTICS_CRON_SECRET задан' : 'не задан в v2/analytics/.env на Hostland' }}
                    </dd>
                  </div>
                </dl>
              </div>

              <div class="ctrl-block-box">
                <h3 class="ctrl-h">Диапазон</h3>
                <div class="ph-controls">
                  <label>С <input v-model="phFrom" type="date" /></label>
                  <label>По <input v-model="phTo" type="date" /></label>
                  <button
                    type="button"
                    class="primary compact"
                    :disabled="jobProg.active && runningId !== t.id"
                    @click="runningId === t.id ? requestJobStop() : runPlayerHourRange()"
                  >{{ runningId === t.id ? (jobProg.stop ? 'Остановка…' : 'Стоп') : 'Обновить диапазон' }}</button>
                </div>
              </div>
            </template>
            <template v-else-if="t.canRun">
              <p class="muted small">
                Окно: последние N дней до сегодня (Испания). Либо задайте точные даты ниже.
              </p>
              <div class="ctrl-block-box">
                <h3 class="ctrl-h">Быстро: дней назад</h3>
                <div class="update-row">
                  <label class="days-label">
                    Дней назад
                    <input
                      :value="daysBackFor(t)"
                      type="number"
                      min="0"
                      max="400"
                      @input="setDaysBack(t, $event.target.value)"
                    />
                  </label>
                  <button
                    type="button"
                    class="primary compact"
                    :disabled="jobProg.active && runningId !== t.id"
                    @click="runningId === t.id ? requestJobStop() : runJob(t)"
                  >{{ runningId === t.id ? (jobProg.stop ? 'Остановка…' : 'Стоп') : 'Обновить (N дней)' }}</button>
                </div>
              </div>
              <div class="ctrl-block-box">
                <h3 class="ctrl-h">Точный диапазон</h3>
                <div class="ph-controls">
                  <label>С <input v-model="jobFrom" type="date" /></label>
                  <label>По <input v-model="jobTo" type="date" /></label>
                  <button
                    type="button"
                    class="primary compact"
                    :disabled="(jobProg.active && runningId !== t.id) || !jobFrom || !jobTo"
                    @click="runningId === t.id ? requestJobStop() : runJobRange(t)"
                  >{{ runningId === t.id ? (jobProg.stop ? 'Остановка…' : 'Стоп') : 'Обновить диапазон' }}</button>
                </div>
              </div>
            </template>
            <p v-else class="muted small">Таблица ещё в плане — обновление недоступно.</p>
            <p v-if="phMsg && t.id === 'player_hour'" class="muted small">{{ phMsg }}</p>
            <p v-if="error" class="bad box">{{ error }}</p>
          </div>
        </article>
        </template>
      </div>

    </template>

    <Teleport to="body">
      <div v-if="detail" class="modal-backdrop" @click.self="detail = null">
        <div class="modal card" role="dialog" aria-modal="true">
          <header class="modal-head">
            <div>
              <h2>{{ detail.title }}</h2>
              <p class="muted code">{{ detail.tableName }} · {{ statusLabel(detail.status) }}</p>
            </div>
            <button type="button" class="ghost compact" @click="detail = null">Закрыть</button>
          </header>

          <section class="modal-block">
            <h3>Зачем</h3>
            <p>{{ detail.purpose }}</p>
          </section>

          <section v-if="detail.rules?.length" class="modal-block">
            <h3>Правила</h3>
            <ul>
              <li v-for="(r, i) in detail.rules" :key="i">{{ r }}</li>
            </ul>
          </section>

          <section class="modal-block">
            <h3>Поля</h3>
            <div class="fields-scroll">
              <table class="fields-table">
                <thead>
                  <tr><th>Поле</th><th>Тип</th><th>Описание</th></tr>
                </thead>
                <tbody>
                  <tr v-for="f in detail.fields || []" :key="f.name">
                    <td class="code">{{ f.name }}</td>
                    <td class="muted">{{ f.type }}</td>
                    <td>{{ f.desc }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="modal-block">
            <h3>План обновления</h3>
            <p>{{ detail.updatePlan }}</p>
          </section>

          <section v-if="detail.lastRun" class="modal-block">
            <h3>Последний запуск</h3>
            <p>
              <span :class="['run-status', detail.lastRun.status]">{{ detail.lastRun.status }}</span>
              · {{ formatUtc(detail.lastRun.finishedAt || detail.lastRun.startedAt) }}
            </p>
            <p v-if="detail.lastRun.message" class="muted">{{ detail.lastRun.message }}</p>
            <pre v-if="detail.lastRun.meta" class="meta">{{ JSON.stringify(detail.lastRun.meta, null, 2) }}</pre>
          </section>

          <footer v-if="detail.canRun" class="modal-foot">
            <label class="days-label">
              Дней назад
              <input v-model.number="daysBack" type="number" min="0" max="400" />
            </label>
            <button
              type="button"
              class="primary compact"
              :disabled="jobProg.active && runningId !== detail.id"
              @click="runningId === detail.id ? requestJobStop() : runJob(detail)"
            >{{ runningId === detail.id ? (jobProg.stop ? 'Остановка…' : 'Стоп') : 'Обновить сейчас' }}</button>
          </footer>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="rowsPreview" class="modal-backdrop" @click.self="rowsPreview = null">
        <div class="modal card modal-wide" role="dialog" aria-modal="true">
          <header class="modal-head">
            <div>
              <h2>Последние {{ rowsPreview.count }} записей</h2>
              <p class="muted code">{{ rowsPreview.tableName }} · {{ rowsPreview.title }}</p>
            </div>
            <button type="button" class="ghost compact" @click="rowsPreview = null">Закрыть</button>
          </header>
          <p class="muted small" style="margin:0 0 10px">{{ rowsPreview.note }}</p>
          <p v-if="rowsError" class="bad box">{{ rowsError }}</p>
          <div v-if="!rowsPreview.rows?.length" class="muted">Строк нет</div>
          <div v-else class="rows-scroll">
            <table class="rows-table">
              <thead>
                <tr>
                  <th v-for="col in rowsPreview.columns" :key="col">{{ col }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in rowsPreview.rows" :key="i">
                  <td v-for="col in rowsPreview.columns" :key="col" :title="String(row[col] ?? '')">
                    {{ formatCell(row[col]) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import LoadingBox from '../components/LoadingBox.vue';
import { api, clearAdminSession, getAdminSession, setAdminSession } from '../api';

const authed = ref(false);
const configured = ref(true);
const locked = ref(false);
const retryAfterSec = ref(0);
const attemptsLeft = ref(3);
const password = ref('');
const loginBusy = ref(false);
const loginError = ref('');

const tables = ref([]);
const detail = ref(null);
const rowsPreview = ref(null);
const rowsBusy = ref('');
const rowsError = ref('');
const loading = ref(false);
const error = ref('');
const runningId = ref('');
const daysBack = ref(60);

/** Прогресс длинных джоб (клиент гоняет по дням). */
const jobProg = ref({
  active: false,
  id: '',
  title: '',
  done: 0,
  total: 0,
  pct: 0,
  day: '',
  line: '',
  stop: false,
  rows: 0
});

function requestJobStop() {
  jobProg.value = { ...jobProg.value, stop: true, line: 'Остановка после текущего дня…' };
  phStop.value = true;
}

function listDaysInclusive(from, to) {
  const out = [];
  if (!from || !to || from > to) return out;
  const cur = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function startJobProgress(id, title, total) {
  jobProg.value = {
    active: true,
    id,
    title,
    done: 0,
    total,
    pct: 0,
    day: '',
    line: total ? `Старт · ${total} дн.` : 'Старт…',
    stop: false,
    rows: 0
  };
  runningId.value = id;
  phStop.value = false;
}

function tickJobProgress(done, day, line, rowsAdd = 0) {
  const total = jobProg.value.total || 1;
  const rows = (jobProg.value.rows || 0) + rowsAdd;
  jobProg.value = {
    ...jobProg.value,
    done,
    day: day || jobProg.value.day,
    rows,
    pct: Math.min(100, Math.round((done * 1000) / total) / 10),
    line: line || jobProg.value.line
  };
}

function endJobProgress(finalLine) {
  const was = jobProg.value;
  jobProg.value = {
    ...was,
    active: false,
    pct: was.total ? (was.done >= was.total ? 100 : was.pct) : 100,
    line: finalLine || was.line,
    stop: false
  };
  runningId.value = '';
  phStop.value = false;
}

/**
 * Прогон списка дней с прогресс-баром.
 * @param {{ id: string, title: string, days: string[], runDay: (day: string) => Promise<{ rows?: number, note?: string }>, onDone?: () => Promise<void> }} opts
 */
async function runDaysWithProgress(opts) {
  const days = opts.days || [];
  if (!days.length) {
    opts.emptyMsg && (phMsg.value = opts.emptyMsg);
    return;
  }
  startJobProgress(opts.id, opts.title, days.length);
  error.value = '';
  phError.value = '';
  let stopped = false;
  try {
    for (let i = 0; i < days.length; i++) {
      if (jobProg.value.stop || phStop.value) {
        stopped = true;
        break;
      }
      const day = days[i];
      tickJobProgress(i, day, `${i + 1}/${days.length}: ${day}…`);
      const r = await opts.runDay(day);
      const rows = Number(r?.rows) || 0;
      tickJobProgress(
        i + 1,
        day,
        r?.note || `Готово ${day}${rows ? ` · +${rows} стр.` : ''}`,
        rows
      );
    }
    if (opts.onDone) await opts.onDone();
    endJobProgress(
      stopped
        ? `Остановлено на ${jobProg.value.done}/${days.length}`
        : `Готово: ${days.length} дн.${jobProg.value.rows ? ` · ${jobProg.value.rows} стр.` : ''}`
    );
    if (opts.id === 'player_hour' || opts.id === 'fill_empty') {
      phMsg.value = jobProg.value.line;
    }
    if (opts.id === 'scrape_hour') {
      scMsg.value = jobProg.value.line;
    }
  } catch (e) {
    const msg = e.message || String(e);
    error.value = msg;
    if (opts.id === 'player_hour' || opts.id === 'fill_empty') phError.value = msg;
    if (opts.id === 'scrape_hour') scError.value = msg;
    endJobProgress(`Ошибка на ${jobProg.value.day || '?'}: ${msg}`);
    throw e;
  }
}

const phFrom = ref('2026-04-01');
const phTo = ref(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }));
const phOneDay = ref(phTo.value);
/** Сегодня ES — для кнопки «Обновить сегодня» (не путать с phOneDay, который пользователь может сменить). */
const phTodayEs = ref(phTo.value);

function refreshTodayEs() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
  phTodayEs.value = today;
  return today;
}

function resetOneDayToToday() {
  phOneDay.value = refreshTodayEs();
}
const jobFrom = ref('2026-04-01');
const jobTo = ref(phTo.value);
const scFrom = ref('2026-04-01');
const scTo = ref(phTo.value);
const scDays = ref([]);
const scSummary = ref(null);
const scLoading = ref(false);
const scError = ref('');
const scMsg = ref('');

const MONTH_RU = {
  '01': 'янв', '02': 'фев', '03': 'мар', '04': 'апр',
  '05': 'май', '06': 'июн', '07': 'июл', '08': 'авг',
  '09': 'сен', '10': 'окт', '11': 'ноя', '12': 'дек'
};

const scRows = computed(() => {
  const rows = scDays.value || [];
  let prevMonth = '';
  return rows.map((d) => {
    const mk = d.monthKey || d.day.slice(0, 7);
    const mm = mk.slice(5, 7);
    const showMonth = mk !== prevMonth;
    prevMonth = mk;
    return {
      day: d.day,
      dayShort: d.day.slice(8, 10),
      monthLabel: showMonth ? (MONTH_RU[mm] || mm) : '',
      hours: d.hours || []
    };
  });
});

function pipelineIndex(t) {
  return tables.value.filter((x) => (x.group || 'pipeline') !== 'ops').findIndex((x) => x.id === t.id) + 1;
}
const phDays = ref([]);
const phSummary = ref(null);
const phLoading = ref(false);
const phBusy = ref(false);
const phBusyDay = ref('');
const phFilling = ref(false);
const phStop = ref(false);
const phMsg = ref('');
const phError = ref('');
const phHover = ref(null);
const phSched = ref(null);
const phSchedEnabled = ref(false);
const phSchedMinutes = ref(10);
const phSchedNextRunAt = ref('');
const phSchedCronOk = ref(false);
const phSchedLoading = ref(false);
const phSchedSaving = ref(false);
const phSchedError = ref('');
const phSchedMsg = ref('');

/** Тикер «молчит», если авто включено, а lastRunAt старше 2× интервала (+2 мин запас). */
const phSchedStale = computed(() => {
  if (!phSchedEnabled.value || !phSched.value?.lastRunAt) return false;
  const mins = Math.max(1, Number(phSchedMinutes.value) || 10);
  const last = Date.parse(String(phSched.value.lastRunAt).replace(' ', 'T') + 'Z');
  if (!Number.isFinite(last)) return false;
  const limitMs = (mins * 2 + 2) * 60 * 1000;
  return Date.now() - last > limitMs;
});
/** Вкладки внутри карточки таблицы: stats | control | update */
const cardTabs = ref({});
const cardDaysBack = ref({});
const phLimits = ['16-25', '50', '100', '250'];

let lockTimer = null;

function tabOf(t) {
  return cardTabs.value[t.id] || 'stats';
}

async function setTab(t, name) {
  cardTabs.value = { ...cardTabs.value, [t.id]: name };
  if (name === 'control' && t.id === 'player_hour') {
    if (!phDays.value.length && !phLoading.value) {
      await loadCoverage();
    }
  }
  if (name === 'update' && t.id === 'player_hour') {
    resetOneDayToToday();
    await loadPlayerHourSchedule();
  }
  if (name === 'control' && t.id === 'scrape_hour' && !scDays.value.length && !scLoading.value) {
    await loadScrapeCoverage();
  }
}

function daysBackFor(t) {
  if (cardDaysBack.value[t.id] != null) return cardDaysBack.value[t.id];
  return t.defaultDaysBack ?? daysBack.value;
}

function setDaysBack(t, val) {
  const n = Math.max(0, Math.min(400, Number(val) || 0));
  cardDaysBack.value = { ...cardDaysBack.value, [t.id]: n };
  daysBack.value = n;
}

const phDayMap = computed(() => {
  const m = {};
  for (const d of phDays.value || []) {
    m[d.day] = d;
  }
  return m;
});

/** GitHub-like сетка: колонки = недели (пн→вс), цвет = плотность игроков */
const phCal = computed(() => {
  const days = phDays.value || [];
  if (!days.length) {
    return { weeks: [], months: [], wdLabels: ['Пн', '', 'Ср', '', 'Пт', '', ''] };
  }

  const players = days.filter((d) => d.rowCount > 0).map((d) => d.players);
  const maxP = Math.max(1, ...players, 1);

  const levelOf = (d) => {
    if (!d || d.status === 'no_data') return 0;
    if (!d || d.rowCount <= 0) return 0;
    if (d.status === 'partial') {
      const r = d.players / maxP;
      return r < 0.25 ? 1 : r < 0.5 ? 2 : 3;
    }
    const r = d.players / maxP;
    if (r < 0.25) return 1;
    if (r < 0.5) return 2;
    if (r < 0.75) return 3;
    return 4;
  };

  const start = days[0].day;
  const end = days[days.length - 1].day;
  // JS: 0=вс … 6=сб → сдвиг к пн=0
  const mondayIndex = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sun
    return wd === 0 ? 6 : wd - 1;
  };

  const cells = [];
  // pad до понедельника первой недели
  const pad = mondayIndex(start);
  for (let i = 0; i < pad; i++) {
    cells.push({ pad: true, level: 0, day: null, status: '' });
  }
  for (const d of days) {
    cells.push({
      pad: false,
      day: d.day,
      status: d.status,
      level: levelOf(d),
      rowCount: d.rowCount,
      players: d.players,
      limitsN: d.limitsN,
      limitsWanted: d.limitsWanted,
      sourceSnapshots: d.sourceSnapshots,
      note: d.note,
      computedAt: d.computedAt
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ pad: true, level: 0, day: null, status: '' });
  }

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  // подписи месяцев над колонками-неделями
  const months = [];
  let prevKey = '';
  weeks.forEach((week, col) => {
    const first = week.find((c) => c.day);
    if (!first?.day) return;
    const key = first.day.slice(0, 7);
    if (key === prevKey) {
      months[months.length - 1].span += 1;
      return;
    }
    prevKey = key;
    const [y, m] = key.split('-');
    const label = new Date(Date.UTC(+y, +m - 1, 1)).toLocaleString('ru-RU', {
      month: 'short',
      timeZone: 'UTC'
    });
    months.push({ key, label, col: col + 1, span: 1 });
  });

  return {
    weeks,
    months,
    wdLabels: ['Пн', '', 'Ср', '', 'Пт', '', '']
  };
});

function cellTip(cell) {
  if (!cell?.day) return '';
  return `${cell.day}: ${phStatusLabel(cell.status)}, строк ${cell.rowCount}, игроков ${cell.players}`;
}

function onCalClick(cell) {
  if (!cell?.day) return;
  phOneDay.value = cell.day;
  const full = phDayMap.value[cell.day] || cell;
  phHover.value = { ...full };
}

function limitShort(lim) {
  if (lim === '16-25') return '16';
  return String(lim);
}

function limitChipClass(flags) {
  if (!flags) return 'off';
  if (flags.agg) return 'on';
  if (flags.src) return 'src-only';
  return 'off';
}

function limitChipTitle(lim, flags) {
  if (!flags) return lim;
  if (flags.agg) return `${lim}: есть в агрегате`;
  if (flags.src) return `${lim}: есть в snapshots, нет в агрегате`;
  return `${lim}: нет`;
}

function hourCellClass(d, h) {
  const src = !!asHourArr(d?.hoursSrc)[h];
  const agg = !!asHourArr(d?.hoursAgg)[h];
  if (agg) return 'on';
  if (src) return 'src-only';
  return 'off';
}

function asHourArr(v) {
  if (!v) return Array(24).fill(false);
  if (Array.isArray(v)) return v;
  return Array.from({ length: 24 }, (_, i) => !!v[i]);
}

function hourTip(d) {
  if (!d) return '';
  const srcArr = asHourArr(d.hoursSrc);
  const aggArr = asHourArr(d.hoursAgg);
  const src = srcArr.map((v, i) => (v ? i : null)).filter((x) => x !== null);
  const gaps = [];
  for (let h = 0; h < 24; h++) {
    if (srcArr[h] && !aggArr[h]) gaps.push(h);
  }
  return `Часы с сырьём: ${src.length ? src.join(',') : '—'}`
    + (gaps.length ? `; не в агрегате: ${gaps.join(',')}` : '');
}

const lockHuman = computed(() => {
  const s = retryAfterSec.value;
  if (s <= 0) return '';
  const m = Math.ceil(s / 60);
  if (m >= 60) return `${Math.ceil(m / 60)} ч`;
  return `${m} мин`;
});

function statusLabel(s) {
  if (s === 'ready') return 'готово';
  if (s === 'planned') return 'в плане';
  return s || '—';
}

function formatUtc(v) {
  if (!v) return '—';
  const raw = String(v).includes('T') ? String(v) : `${String(v).replace(' ', 'T')}Z`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('ru-RU', { timeZone: 'Europe/Madrid' }) + ' (ES)';
}

/** Короче для колонки таблицы дней. */
function formatUtcShort(v) {
  if (!v) return '—';
  const raw = String(v).includes('T') ? String(v) : `${String(v).replace(' ', 'T')}Z`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(v);
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  return `${get('day')}.${get('month')} ${get('hour')}:${get('minute')}`;
}

function formatCell(v) {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

async function openRows(t) {
  if (!t?.id || t.status !== 'ready') return;
  rowsError.value = '';
  rowsBusy.value = t.id;
  try {
    const res = await api.admin.tableRows(t.id, 100);
    rowsPreview.value = res;
  } catch (e) {
    rowsError.value = e.message || String(e);
    rowsPreview.value = {
      title: t.title,
      tableName: t.tableName,
      count: 0,
      columns: [],
      rows: [],
      note: ''
    };
  } finally {
    rowsBusy.value = '';
  }
}

function startLockCountdown() {
  stopLockCountdown();
  lockTimer = setInterval(() => {
    if (retryAfterSec.value > 0) {
      retryAfterSec.value -= 1;
    }
    if (retryAfterSec.value <= 0) {
      locked.value = false;
      attemptsLeft.value = 3;
      stopLockCountdown();
    }
  }, 1000);
}

function stopLockCountdown() {
  if (lockTimer) {
    clearInterval(lockTimer);
    lockTimer = null;
  }
}

async function checkSession() {
  const token = getAdminSession();
  if (token) setAdminSession(token);
  try {
    const res = await api.admin.session();
    configured.value = res.configured !== false;
    locked.value = Boolean(res.locked);
    retryAfterSec.value = Number(res.retryAfterSec || 0);
    attemptsLeft.value = res.attemptsLeft != null ? Number(res.attemptsLeft) : 3;
    if (locked.value) startLockCountdown();
    if (res.ok) {
      authed.value = true;
      await load();
    } else {
      authed.value = false;
      if (!res.locked) clearAdminSession();
    }
  } catch (e) {
    authed.value = false;
    loginError.value = e.message || String(e);
  }
}

async function doLogin() {
  loginError.value = '';
  loginBusy.value = true;
  try {
    const res = await api.admin.login(password.value);
    if (res.ok && res.token) {
      setAdminSession(res.token);
      password.value = '';
      authed.value = true;
      locked.value = false;
      attemptsLeft.value = 3;
      await load();
      return;
    }
    if (res.locked) {
      locked.value = true;
      retryAfterSec.value = Number(res.retryAfterSec || 3600);
      attemptsLeft.value = 0;
      startLockCountdown();
    } else if (res.attemptsLeft != null) {
      attemptsLeft.value = Number(res.attemptsLeft);
    }
    loginError.value = res.error || 'Неверный пароль';
  } catch (e) {
    loginError.value = e.message || String(e);
  } finally {
    loginBusy.value = false;
  }
}

async function doLogout() {
  try {
    await api.admin.logout();
  } catch {
    /* ignore */
  }
  clearAdminSession();
  authed.value = false;
  tables.value = [];
  detail.value = null;
}

function phStatusLabel(s) {
  if (s === 'ok') return 'готово';
  if (s === 'partial') return 'неполно';
  if (s === 'subset') return 'лимиты';
  if (s === 'today') return 'сегодня';
  if (s === 'empty') return 'пусто';
  if (s === 'no_data') return 'нет данных';
  return s || '—';
}

async function loadScrapeCoverage() {
  scLoading.value = true;
  scError.value = '';
  try {
    const res = await api.admin.scrapeHourCoverage(scFrom.value, scTo.value);
    scDays.value = res.days || [];
    scSummary.value = res.summary || null;
  } catch (e) {
    scError.value = e.message || String(e);
  } finally {
    scLoading.value = false;
  }
}

async function runScrapeRange() {
  if (!scFrom.value || !scTo.value) return;
  if (jobProg.value.active) return;
  scError.value = '';
  scMsg.value = '';
  const days = listDaysInclusive(scFrom.value, scTo.value);
  try {
    await runDaysWithProgress({
      id: 'scrape_hour',
      title: 'Часы сбора',
      days,
      runDay: async (day) => {
        const res = await api.admin.run('scrape_hour', { dayFrom: day, dayTo: day });
        return { rows: res?.run?.meta?.rowsUpserted || 0 };
      },
      onDone: async () => {
        await load();
        await loadScrapeCoverage();
      }
    });
  } catch {
    await loadScrapeCoverage();
  }
}

async function loadCoverage() {
  phLoading.value = true;
  phError.value = '';
  try {
    const res = await api.admin.playerHourCoverage(phFrom.value, phTo.value);
    phDays.value = res.days || [];
    phSummary.value = res.summary || null;
    // Не перетираем phOneDay на nextEmpty — в «Обновление» дефолт = сегодня.
  } catch (e) {
    phError.value = e.message || String(e);
  } finally {
    phLoading.value = false;
  }
}

function applyPlayerHourSchedulePayload(res) {
  const s = res?.schedule || null;
  phSched.value = s;
  phSchedEnabled.value = !!(s && s.enabled);
  phSchedMinutes.value = Math.max(1, Number(s?.intervalMinutes) || 10);
  phSchedNextRunAt.value = res?.nextRunAt ? `${res.nextRunAt} UTC` : '';
  phSchedCronOk.value = !!res?.cronSecretConfigured;
}

async function loadPlayerHourSchedule() {
  phSchedLoading.value = true;
  phSchedError.value = '';
  phSchedMsg.value = '';
  try {
    const res = await api.admin.playerHourScheduleGet();
    applyPlayerHourSchedulePayload(res);
  } catch (e) {
    phSchedError.value = e.message || String(e);
  } finally {
    phSchedLoading.value = false;
  }
}

async function savePlayerHourSchedule() {
  const mins = Math.max(1, Math.min(1440, Number(phSchedMinutes.value) || 10));
  phSchedMinutes.value = mins;
  phSchedSaving.value = true;
  phSchedError.value = '';
  phSchedMsg.value = '';
  try {
    const res = await api.admin.playerHourScheduleSave({
      enabled: !!phSchedEnabled.value,
      intervalMinutes: mins
    });
    applyPlayerHourSchedulePayload(res);
    phSchedMsg.value = phSchedEnabled.value
      ? `Сохранено: каждые ${mins} мин`
      : 'Сохранено: авто выключено';
  } catch (e) {
    phSchedError.value = e.message || String(e);
  } finally {
    phSchedSaving.value = false;
  }
}

async function runOneDay(day) {
  if (!day || phBusy.value || jobProg.value.active) return;
  phBusy.value = true;
  phBusyDay.value = day;
  phError.value = '';
  phMsg.value = `Собираем ${day}…`;
  try {
    const res = await api.admin.playerHourRunDay(day);
    if (res.meta?.noDataDays) {
      phMsg.value = `${day}: в snapshots нет данных (отмечено no_data)`;
    } else {
      phMsg.value = res.meta
        ? `Готово ${day}: ${res.meta.rowsUpserted} строк`
        : `Готово ${day}`;
    }
    await loadCoverage();
    try {
      const resTables = await api.admin.tables();
      tables.value = resTables.tables || [];
    } catch {
      /* ignore */
    }
  } catch (e) {
    phError.value = e.message || String(e);
    phMsg.value = '';
  } finally {
    phBusy.value = false;
    phBusyDay.value = '';
  }
}

async function fillEmptyDays() {
  if (phFilling.value) {
    requestJobStop();
    phMsg.value = 'Остановка после текущего дня…';
    return;
  }
  if (jobProg.value.active) return;
  phFilling.value = true;
  phError.value = '';
  await loadCoverage();
  const queue = (phDays.value || [])
    .filter((d) => d.status === 'empty' || d.status === 'partial' || d.status === 'no_data')
    .map((d) => d.day);
  try {
    await runDaysWithProgress({
      id: 'fill_empty',
      title: 'Пустые / неполные дни',
      days: queue,
      emptyMsg: 'Пустых дней нет',
      runDay: async (day) => {
        phBusy.value = true;
        phBusyDay.value = day;
        const res = await api.admin.playerHourRunDay(day);
        return {
          rows: res.meta?.rowsUpserted || 0,
          note: res.meta?.noDataDays
            ? `${day}: no_data`
            : `Готово ${day}: ${res.meta?.rowsUpserted || 0} стр.`
        };
      },
      onDone: async () => {
        await loadCoverage();
        await load();
      }
    });
  } catch {
    await loadCoverage();
  } finally {
    phBusy.value = false;
    phBusyDay.value = '';
    phFilling.value = false;
  }
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.admin.tables();
    tables.value = res.tables || [];
    if (tabOf({ id: 'player_hour' }) === 'control') {
      await loadCoverage();
    }
  } catch (e) {
    error.value = e.message || String(e);
    if (String(error.value).includes('авторизац') || String(error.value).includes('401')) {
      await doLogout();
    }
  } finally {
    loading.value = false;
  }
}

async function openDetail(id) {
  error.value = '';
  try {
    const res = await api.admin.table(id);
    detail.value = res.table;
    if (res.table?.defaultDaysBack != null) {
      daysBack.value = res.table.defaultDaysBack;
    }
  } catch (e) {
    error.value = e.message || String(e);
  }
}

async function runJob(t) {
  if (!t?.canRun || jobProg.value.active) return;
  error.value = '';
  const back = daysBackFor(t);
  daysBack.value = back;
  const to = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
  const fromDate = new Date(`${to}T12:00:00Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - back);
  const from = fromDate.toISOString().slice(0, 10);
  const days = listDaysInclusive(from, to);
  try {
    await runDaysWithProgress({
      id: t.id,
      title: t.title || t.id,
      days,
      runDay: async (day) => {
        if (t.id === 'player_hour') {
          const res = await api.admin.playerHourRunDay(day);
          return { rows: res.meta?.rowsUpserted || 0 };
        }
        const res = await api.admin.run(t.id, { dayFrom: day, dayTo: day });
        return { rows: res?.run?.meta?.rowsUpserted || 0 };
      },
      onDone: async () => {
        await load();
        if (detail.value?.id === t.id) {
          const d = await api.admin.table(t.id);
          detail.value = d.table;
        }
        if (t.id === 'player_hour') await loadCoverage();
        if (t.id === 'scrape_hour') await loadScrapeCoverage();
      }
    });
  } catch {
    await load();
  }
}

async function runJobRange(t) {
  if (!t?.canRun || !jobFrom.value || !jobTo.value || jobProg.value.active) return;
  error.value = '';
  const days = listDaysInclusive(jobFrom.value, jobTo.value);
  try {
    await runDaysWithProgress({
      id: t.id,
      title: t.title || t.id,
      days,
      runDay: async (day) => {
        if (t.id === 'player_hour') {
          const res = await api.admin.playerHourRunDay(day);
          return { rows: res.meta?.rowsUpserted || 0 };
        }
        const res = await api.admin.run(t.id, { dayFrom: day, dayTo: day });
        return { rows: res?.run?.meta?.rowsUpserted || 0 };
      },
      onDone: async () => {
        await load();
        if (t.id === 'player_hour') await loadCoverage();
        if (t.id === 'scrape_hour') await loadScrapeCoverage();
      }
    });
  } catch {
    await load();
  }
}

async function runPlayerHourRange() {
  if (!phFrom.value || !phTo.value || jobProg.value.active) return;
  error.value = '';
  phError.value = '';
  const days = listDaysInclusive(phFrom.value, phTo.value);
  try {
    await runDaysWithProgress({
      id: 'player_hour',
      title: 'Почасовой max игрока',
      days,
      runDay: async (day) => {
        phBusy.value = true;
        phBusyDay.value = day;
        const res = await api.admin.playerHourRunDay(day);
        return {
          rows: res.meta?.rowsUpserted || 0,
          note: res.meta?.noDataDays
            ? `${day}: no_data`
            : `Готово ${day}: ${res.meta?.rowsUpserted || 0} стр.`
        };
      },
      onDone: async () => {
        await load();
        await loadCoverage();
      }
    });
  } catch {
    /* error already set */
  } finally {
    phBusy.value = false;
    phBusyDay.value = '';
  }
}

onMounted(checkSession);
onUnmounted(stopLockCountdown);
</script>

<style scoped>
.admin-page { max-width: 1100px; }
.job-prog {
  position: sticky;
  top: 8px;
  z-index: 40;
  margin: 0 0 14px;
  padding: 12px 14px 10px;
  border: 1px solid #3d5a7a;
  background: #152033;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}
.job-prog-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
  font-size: 0.92rem;
}
.job-prog-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.job-pct {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: #7dd3fc;
}
.job-bar {
  height: 10px;
  border-radius: 999px;
  background: #0c111a;
  overflow: hidden;
  border: 1px solid #2a3548;
}
.job-fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, #2f6f9a, #5b9fd4);
  transition: width 0.25s ease;
}
.job-line {
  margin: 8px 0 0;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.75rem;
}
.box {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: #0c111a;
  font-size: 0.88rem;
  line-height: 1.4;
}
.bad.box { border-color: #7f1d1d; background: #1c1014; }
.warn.box { border-color: #854d0e; background: #1a160c; color: var(--warn); }

.login-wrap {
  min-height: 55vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 8px;
}
.login-card {
  width: min(420px, 100%);
  padding: 22px 22px 20px;
}
.login-card h1 {
  margin: 0 0 8px;
  font-size: 1.35rem;
}
.login-card .lead { margin: 0 0 18px; font-size: 0.9rem; line-height: 1.45; }
.login-form { display: flex; flex-direction: column; gap: 12px; }
.login-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.8rem;
  color: var(--muted);
}
.login-form input { height: 40px; font-size: 1rem; }
.login-form button.primary { height: 40px; margin-top: 4px; }

.head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.agg-card {
  padding: 14px 16px 12px;
  border: 1px solid var(--line);
}
.agg-card.planned { opacity: 0.85; }
.agg-card.has-open-ctrl {
  border-color: #4a5f7c;
  background: #1a222f;
}
.agg-num {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 2px;
}
.agg-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
}
.agg-tabs button {
  appearance: none;
  border: 1px solid var(--line);
  background: #0c111a;
  color: var(--muted);
  font: inherit;
  font-size: 0.78rem;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
}
.agg-tabs button:disabled {
  opacity: 0.4;
  cursor: default;
}
.agg-tabs button.on {
  color: var(--text);
  border-color: #4a5f7c;
  background: #1c2433;
}
.agg-pane { margin-top: 2px; }
.cat-section {
  margin: 22px 0 10px;
  font-size: 0.95rem;
  font-weight: 650;
  color: var(--text);
}
.cat-section.ops {
  margin-top: 36px;
  padding-top: 16px;
  border-top: 1px dashed #3a4a63;
  color: #94a3b8;
}
.agg-card.ops-card {
  border-color: #475569;
  background: #151b26;
}
.hm-wrap {
  overflow-x: auto;
  margin-top: 10px;
  padding: 10px;
  background: #0c111a;
  border: 1px solid var(--line);
  border-radius: 10px;
}
.hm-head,
.hm-row {
  display: grid;
  grid-template-columns: 36px 28px 1fr;
  gap: 6px;
  align-items: center;
  margin-bottom: 2px;
}
.hm-hours {
  display: grid;
  grid-template-columns: repeat(24, 12px);
  gap: 2px;
}
.hm-h {
  font-size: 0.58rem;
  color: var(--muted);
  text-align: center;
  line-height: 12px;
}
.hm-month {
  font-size: 0.68rem;
  color: var(--muted);
  text-transform: lowercase;
}
.hm-day {
  font-size: 0.68rem;
  text-align: right;
}
.hm-cell {
  display: block;
  width: 12px;
  height: 12px;
  border-radius: 2px;
  background: #1e293b;
}
.hm-cell.st-ok { background: #22c55e; }
.hm-cell.st-down { background: #ef4444; }
.hm-cell.st-pending { background: #64748b; }
.hm-cell.st-missing { background: #1e293b; box-shadow: inset 0 0 0 1px #334155; }
.hm-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-top: 10px;
  font-size: 0.72rem;
}
.hm-legend .hm-cell { display: inline-block; }
.ctrl-block-box {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #3a4a63;
  background: #171e2a;
}
.ctrl-h {
  margin: 0 0 8px;
  font-size: 0.82rem;
  font-weight: 650;
  color: var(--text);
}
.update-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
.agg-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: 8px;
}
.title-btn {
  background: none;
  border: 0;
  padding: 0;
  color: var(--text);
  font-size: 1.05rem;
  font-weight: 650;
  text-align: left;
  cursor: pointer;
}
.title-btn:hover { color: var(--accent); }
.agg-short {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.4;
}
.agg-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 16px;
  margin: 0 0 8px;
}
.agg-meta dt {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  margin-bottom: 2px;
}
.agg-meta dd { margin: 0; font-size: 0.88rem; }
.agg-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}
.code { font-family: ui-monospace, Consolas, monospace; font-size: 0.78rem; }
.pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  border: 1px solid var(--line);
  flex-shrink: 0;
}
.pill.ready { background: #14301f; color: #86efac; border-color: #245c38; }
.pill.planned { background: #2a2410; color: #fbbf24; border-color: #5c4a18; }
.run-status { font-weight: 650; text-transform: uppercase; font-size: 0.72rem; }
.run-status.ok { color: #86efac; }
.run-status.error { color: #f87171; }
.run-status.running { color: #60a5fa; }
.small { font-size: 0.78rem; }
.run-msg { margin: 0 0 4px; }

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 80;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 32px 12px;
  overflow: auto;
}
.modal {
  width: min(720px, 100%);
  padding: 16px 18px 18px;
}
.modal-wide {
  width: min(1100px, 100%);
}
.rows-scroll {
  overflow: auto;
  max-height: min(70vh, 640px);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.rows-table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}
.rows-table th,
.rows-table td {
  border-bottom: 1px solid var(--line);
  padding: 5px 8px;
  text-align: left;
  white-space: nowrap;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rows-table th {
  position: sticky;
  top: 0;
  background: var(--card, #15181e);
  color: var(--muted);
  font-weight: 650;
  z-index: 1;
}
.nowrap { white-space: nowrap; }
.modal-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.modal-head h2 { margin: 0; font-size: 1.15rem; }
.modal-block { margin-bottom: 14px; }
.modal-block h3 {
  margin: 0 0 6px;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.modal-block p, .modal-block li { font-size: 0.9rem; line-height: 1.45; }
.fields-scroll { overflow: auto; max-height: 420px; }
.fields-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.84rem;
}
.fields-table th:nth-child(1),
.fields-table td:nth-child(1) { width: 22%; white-space: nowrap; }
.fields-table th:nth-child(2),
.fields-table td:nth-child(2) { width: 14%; white-space: nowrap; }
.fields-table th:nth-child(3),
.fields-table td:nth-child(3) { width: 64%; }
.fields-table th, .fields-table td {
  border-bottom: 1px solid var(--line);
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
  line-height: 1.45;
}
.fields-table td:nth-child(3) {
  color: #c8d0dc;
  white-space: normal;
}
.meta {
  background: #0c111a;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px;
  font-size: 0.75rem;
  overflow: auto;
}
.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  align-items: center;
  margin-top: 8px;
}
.days-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
  color: var(--muted);
  margin-right: auto;
}
.days-label input {
  width: 72px;
  height: 30px;
  border-radius: 8px;
  padding: 0 8px;
}
@media (max-width: 700px) {
  .agg-meta { grid-template-columns: 1fr; }
}

.ph-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
  margin: 12px 0;
}
.ph-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}
.kpi-mini {
  background: #151c28;
  border: 1px solid #3a4a63;
  border-radius: 10px;
  padding: 8px 12px;
  min-width: 88px;
}
.kpi-mini .lab {
  display: block;
  font-size: 0.7rem;
  color: var(--muted);
  margin-bottom: 2px;
}
.kpi-mini.ok strong { color: var(--ok); }
.kpi-mini.warn strong { color: var(--warn); }
.kpi-mini.bad strong { color: var(--bad); }
.kpi-mini.nodata strong { color: #94a3b8; }
.kpi-mini.subset strong { color: #7dd3fc; }
.kpi-mini.today strong { color: #a78bfa; }
.ph-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
  margin-bottom: 10px;
}
.ph-controls label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.75rem;
  color: var(--muted);
}
.ph-controls input[type='date'] {
  height: 34px;
  min-width: 140px;
}
.ph-sched-check {
  flex-direction: row !important;
  align-items: center;
  gap: 8px !important;
  height: 34px;
  padding-bottom: 2px;
}
.ph-sched-min {
  height: 34px;
  width: 88px;
  padding: 0 8px;
}
.ph-sched-meta {
  display: grid;
  gap: 6px 14px;
  margin: 0 0 4px;
}
.ph-sched-meta > div {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 8px;
  align-items: baseline;
}
.ph-sched-meta dt {
  margin: 0;
  font-weight: 600;
  color: var(--muted);
}
.ph-sched-meta dd {
  margin: 0;
  color: var(--text);
}
.ph-table-wrap {
  max-height: 420px;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 10px;
}
.ph-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}
.ph-table th,
.ph-table td {
  padding: 7px 10px;
  border-bottom: 1px solid var(--line);
  text-align: left;
  white-space: nowrap;
}
.ph-table th {
  position: sticky;
  top: 0;
  background: #1a2230;
  z-index: 1;
}
.ph-table tr.st-empty { background: rgba(251, 113, 133, 0.06); }
.ph-table tr.st-partial { background: rgba(251, 191, 36, 0.06); }
.ph-table tr.st-no_data { background: rgba(148, 163, 184, 0.1); }
.ph-table tr.st-subset { background: rgba(125, 211, 252, 0.08); }
.ph-table tr.st-today { background: rgba(167, 139, 250, 0.08); }
.ph-table tr.active { outline: 1px solid var(--accent); }
.row-note {
  font-size: 0.68rem;
  max-width: 220px;
  white-space: normal;
  line-height: 1.3;
  margin-top: 3px;
}
.pill-sm {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.72rem;
  border: 1px solid var(--line);
}
.pill-sm.ok { color: var(--ok); border-color: #065f46; }
.pill-sm.partial { color: var(--warn); border-color: #854d0e; }
.pill-sm.empty { color: var(--bad); border-color: #7f1d1d; }
.pill-sm.no_data { color: #94a3b8; border-color: #475569; }
.pill-sm.subset { color: #7dd3fc; border-color: #0369a1; }
.pill-sm.today { color: #a78bfa; border-color: #6d28d9; }

.lim-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.lim-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 0.68rem;
  font-weight: 600;
  border: 1px solid #334155;
  color: #64748b;
  background: #0f172a;
}
.lim-chip.on {
  color: #86efac;
  border-color: #166534;
  background: #052e1a;
}
.lim-chip.on::after { content: ' ✓'; font-weight: 400; }
.lim-chip.src-only {
  color: #fbbf24;
  border-color: #854d0e;
  background: #1a1408;
}
.lim-chip.off { opacity: 0.55; }
.lim-chip.off::after { content: ' ·'; }

.hour-wrap { margin: 6px 0; }
.hour-bar {
  display: grid;
  grid-template-columns: repeat(24, 1fr);
  gap: 1px;
  min-width: 168px;
  max-width: 280px;
  height: 12px;
}
.hour-cell {
  display: block;
  height: 100%;
  border-radius: 1px;
  background: #1e293b;
}
.hour-cell.on { background: #22c55e; }
.hour-cell.src-only { background: #f59e0b; }
.hour-cell.off { background: #1e293b; }
.hour-scale {
  display: flex;
  justify-content: space-between;
  font-size: 0.62rem;
  max-width: 280px;
  margin-top: 2px;
}
.tip-lim { margin-top: 6px; }
.tip-hours { margin: 8px 0; }
.small { font-size: 0.8rem; }

.ph-note {
  margin: 0 0 14px;
  line-height: 1.45;
}
.gh-wrap {
  margin: 0 0 14px;
  padding: 12px 12px 10px;
  background: #0c111a;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow-x: auto;
}
.gh-months {
  display: grid;
  gap: 3px;
  margin: 0 0 6px 28px;
  min-width: max-content;
  font-size: 0.7rem;
  color: var(--muted);
}
.gh-month {
  white-space: nowrap;
  overflow: hidden;
}
.gh-body {
  display: flex;
  gap: 6px;
  min-width: max-content;
}
.gh-wdays {
  display: grid;
  grid-template-rows: repeat(7, 12px);
  gap: 3px;
  font-size: 0.65rem;
  color: var(--muted);
  align-items: center;
}
.gh-wday { line-height: 12px; height: 12px; }
.gh-weeks {
  display: flex;
  gap: 3px;
}
.gh-week {
  display: grid;
  grid-template-rows: repeat(7, 12px);
  gap: 3px;
}
.gh-cell {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  border: 1px solid transparent;
  padding: 0;
  background: #161b22;
  cursor: pointer;
}
button.gh-cell { appearance: none; }
.gh-cell.pad {
  visibility: hidden;
  pointer-events: none;
}
.gh-cell.lv-0 { background: #161b22; }
.gh-cell.lv-1 { background: #0e4429; }
.gh-cell.lv-2 { background: #006d32; }
.gh-cell.lv-3 { background: #26a641; }
.gh-cell.lv-4 { background: #39d353; }
.gh-cell.empty.lv-0 { background: #2a1215; border-color: #5c1a1a; }
.gh-cell.no_data {
  background: repeating-linear-gradient(
    -45deg,
    #1e293b,
    #1e293b 2px,
    #334155 2px,
    #334155 4px
  );
  border-color: #64748b;
}
.gh-cell.partial { box-shadow: inset 0 0 0 1px #fbbf24; }
.gh-cell.subset { box-shadow: inset 0 0 0 1px #7dd3fc; }
.gh-cell.today { box-shadow: inset 0 0 0 1px #a78bfa; }
.gh-cell.sel { outline: 2px solid #60a5fa; outline-offset: 1px; }
.gh-cell:disabled { cursor: default; }
.gh-legend {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  font-size: 0.72rem;
  flex-wrap: wrap;
}
.gh-legend .gh-cell {
  cursor: default;
  display: inline-block;
}
.gh-leg-gap { width: 12px; }
.gh-tip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 0 0 12px;
  padding: 10px 12px;
  font-size: 0.85rem;
}
</style>
