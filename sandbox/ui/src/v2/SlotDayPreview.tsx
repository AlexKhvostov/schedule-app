import { useTranslation } from "react-i18next";
import { limitTone } from "../schedule/capacity";
import { MARKS, ME } from "../schedule/marks";
import { OptLevelLane } from "./OptLevelLane";
import { ScheduleSlot } from "./ScheduleSlot";

const SLOT_COUNT = 48;
const PAST_UNTIL = 16;

type DemoMark = { t: string; bg: string; fg: string; tables: number };

const L0: Record<number, DemoMark> = {
  18: ME,
  19: ME,
  20: ME,
  21: ME,
  28: MARKS[3],
  29: MARKS[3],
  30: MARKS[3],
};

const L1: Record<number, DemoMark> = {
  8: MARKS[0],
  9: MARKS[0],
  32: MARKS[1],
  33: MARKS[1],
};

function DemoCell({ half, level, mark }: { half: number; level: number; mark?: DemoMark }) {
  const past = half < PAST_UNTIL;
  const locked = level === 1 && half >= 44;
  return (
    <ScheduleSlot
      past={past}
      locked={locked}
      letters={mark?.t}
      bg={mark?.bg}
      fg={mark?.fg}
      tables={mark?.tables}
    />
  );
}

function Lane({ level, marks }: { level: number; marks: Record<number, DemoMark> }) {
  return (
    <OptLevelLane label={`50·${level + 1}`} tone={limitTone("50")}>
      {Array.from({ length: SLOT_COUNT }, (_, half) => (
        <DemoCell key={half} half={half} level={level} mark={marks[half]} />
      ))}
    </OptLevelLane>
  );
}

export function SlotDayPreview() {
  const { t } = useTranslation();
  return (
    <div className="shadcn-kit-day">
      <div className="v2-opt is-kit">
        <div className="v2-opt-sheet">
          <div className="v2-opt-hours">
            <div className="v2-opt-day v2-opt-lab">{t("v2.day")}</div>
            <div className="v2-opt-nl v2-opt-lab">NL</div>
            <div className="v2-opt-track v2-opt-head v2-mono relative">
              {Array.from({ length: 24 }, (_, hour) => {
                const msk = (hour + 3) % 24;
                return (
                  <span key={hour} data-h={hour} className="v2-opt-hour" style={{ gridColumn: `${hour * 2 + 1} / span 2` }}>
                    <b>
                      {hour}–{hour + 1}
                    </b>
                    <small title="MSK">
                      {msk}–{msk + 1 > 24 ? 24 : msk + 1}
                    </small>
                  </span>
                );
              })}
            </div>
          </div>
          <div className="v2-days">
            <div className="v2-days-inner">
              <div className="v2-opt-block">
                <div className="v2-opt-day v2-mono">
                  <b>18</b>
                  <small>ср</small>
                </div>
                <div className="v2-opt-lanes">
                  <div className="v2-opt-limit">
                    <Lane level={0} marks={L0} />
                    <Lane level={1} marks={L1} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
