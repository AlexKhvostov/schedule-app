import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({account:"account-a",generation:1,session:vi.fn(),query:vi.fn(),publish:vi.fn(),from:vi.fn()}));
vi.mock("./client", () => ({getSupabase:() => ({from:mock.from})}));
vi.mock("./appRealtime", () => ({getAppAccount:mock.session,getAppAccountKey:() => mock.account,getAppAccountGeneration:() => mock.generation,updateAppPresenceWinamax:mock.publish}));
import {loadMyPlays} from "./plays";

const rows = [{id:"p1",rooms:{slug:"winamax"},player_limits:[],player_nicks:[
  {nick:"Old",at:"2026-01-01",source:"manual",distance_month:null},
  {nick:"Current",at:"2026-11-01",source:"manual",distance_month:null},
]}];
beforeEach(() => {
  mock.account="account-a"; mock.query.mockReset(); mock.publish.mockReset(); mock.from.mockReset();
  mock.generation=1; mock.session.mockReset().mockImplementation(async () => mock.account);
  mock.from.mockReturnValue({select:() => ({eq:mock.query})});
});

it("shares the current Winamax nickname from the existing plays response without another query", async () => {
  mock.query.mockResolvedValue({data:rows,error:null});
  const plays = await loadMyPlays("member-a");
  expect(plays[0].nick).toBe("Current"); expect(mock.publish).toHaveBeenCalledExactlyOnceWith("member-a","Current");
  expect(mock.from).toHaveBeenCalledExactlyOnceWith("players"); expect(mock.query).toHaveBeenCalledOnce();
});

it("does not publish a late previous-account response", async () => {
  let finish!: (value: unknown) => void;
  mock.query.mockImplementation(() => new Promise(resolve => {finish=resolve;}));
  const pending = loadMyPlays("member-a"); await Promise.resolve(); mock.account="account-b"; ++mock.generation; finish({data:rows,error:null});
  await pending; expect(mock.publish).not.toHaveBeenCalled();
});

it("rejects an old response even when the account changes A to B and back to A", async () => {
  let finish!: (value: unknown) => void;
  mock.query.mockImplementation(() => new Promise(resolve => {finish=resolve;}));
  const pending = loadMyPlays("member-a"); await Promise.resolve();
  mock.generation += 2; finish({data:rows,error:null});
  await pending; expect(mock.publish).not.toHaveBeenCalled();
});

it("waits for initial local session resolution before capturing the account generation", async () => {
  let signedIn!: (account: string) => void;
  mock.session.mockImplementation(() => new Promise(resolve => {signedIn=resolve;}));
  mock.query.mockResolvedValue({data:rows,error:null});
  const pending = loadMyPlays("member-a"); expect(mock.query).not.toHaveBeenCalled();
  ++mock.generation; signedIn("account-a"); await pending;
  expect(mock.publish).toHaveBeenCalledExactlyOnceWith("member-a","Current");
});

it("does not replace an existing nickname with a failed read, but clears a confirmed empty result", async () => {
  mock.query.mockResolvedValueOnce({data:null,error:{message:"unavailable"}}).mockResolvedValueOnce({data:[],error:null});
  await loadMyPlays("member-a"); expect(mock.publish).not.toHaveBeenCalled();
  await loadMyPlays("member-a"); expect(mock.publish).toHaveBeenCalledExactlyOnceWith("member-a","");
});
