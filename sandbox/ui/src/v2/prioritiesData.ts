export const PRIORITY_MONTHS = [
  { key: "2026-02", label: "02.2026", weight: "0.5" },
  { key: "2026-04", label: "04.2026", weight: "0.5" },
  { key: "2026-05", label: "05.2026", weight: "1.0" },
  { key: "2026-07", label: "07.2026", weight: "1.0" },
] as const;

export const PRIORITY_STAKES = [
  { label: "50", weight: "1.0" },
  { label: "100+", weight: "2.0" },
] as const;

export type PriorityRow = {
  rank: number;
  nick: string;
  months: [string, string, string, string];
  total: string;
};

/** Snapshot from references/Schedule 50 (nitro)/Priorities.html — display only, no calc. */
export const PRIORITY_ROWS: PriorityRow[] = [
  { rank: 1, nick: "Plastilin", months: ["15 243", "38 587", "17 675", "52 378"], total: "168 640" },
  { rank: 2, nick: "admiral", months: ["23 866", "26 623", "39 914", "25 959"], total: "130 388" },
  { rank: 3, nick: "nireple_", months: ["19 193", "23 495", "11 015", "32 796"], total: "109 699" },
  { rank: 4, nick: "svalse", months: ["7 623", "26 068", "7 678", "35 236"], total: "108 030" },
  { rank: 5, nick: "atlantmv", months: ["4 770", "26 844", "4 777", "28 902"], total: "91 810" },
  { rank: 6, nick: "Dimbalans", months: ["23 165", "7 882", "43 164", "11 133"], total: "84 895" },
  { rank: 7, nick: "Lo4io", months: ["27 165", "9 198", "38 249", "11 274"], total: "83 578" },
  { rank: 8, nick: "Egor 76324", months: ["22 841", "19 557", "32 934", "9 590"], total: "83 092" },
  { rank: 9, nick: "dReeemer", months: ["44 289", "7 193", "43 183", "4 361"], total: "81 243" },
  { rank: 10, nick: "Qiwo", months: ["16 285", "7 461", "24 472", "18 479"], total: "77 034" },
  { rank: 11, nick: "wez", months: ["24 277", "9 934", "2 580", "24 641"], total: "73 935" },
  { rank: 12, nick: "PlayerOK", months: ["5 442", "16 751", "6 682", "22 665"], total: "71 484" },
  { rank: 13, nick: "Bonyk", months: ["17 163", "3 863", "40 625", "4 392"], total: "61 854" },
  { rank: 14, nick: "Youvelir", months: ["38 899", "0", "34 412", "0"], total: "53 862" },
  { rank: 15, nick: "João Gil", months: ["10 721", "2 437", "39 350", "3 264"], total: "53 676" },
  { rank: 16, nick: "tck3", months: ["39 500", "1 426", "17 290", "1 610"], total: "41 686" },
  { rank: 17, nick: "pa4enko", months: ["15 669", "1 042", "9 114", "8 666"], total: "35 323" },
  { rank: 18, nick: "gambit1234", months: ["6 190", "7 212", "3 660", "3 049"], total: "20 065" },
  { rank: 19, nick: "legacu23stakys", months: ["3 942", "0", "16 136", "487"], total: "19 081" },
  { rank: 20, nick: "muzon3906", months: ["7 015", "0", "9 459", "131"], total: "13 229" },
  { rank: 21, nick: "Gunpowderr", months: ["4 832", "1 016", "7 314", "947"], total: "12 640" },
  { rank: 22, nick: "Belyi", months: ["2 301", "12", "2 854", "1 370"], total: "6 757" },
  { rank: 23, nick: "freeble", months: ["1 012", "0", "2 381", "0"], total: "2 887" },
  { rank: 24, nick: "pavel_sunstoke", months: ["0", "0", "407", "1 220"], total: "2 847" },
  { rank: 25, nick: "nutshelld", months: ["0", "0", "980", "660"], total: "2 300" },
  { rank: 26, nick: "ukrainianfla", months: ["1 009", "0", "352", "558"], total: "1 973" },
  { rank: 27, nick: "Wanted_str", months: ["0", "0", "1 086", "0"], total: "1 086" },
];
