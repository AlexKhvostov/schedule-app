import { describe, expect, it } from "vitest";
import { playerToken, pickPlayer } from "./playerSuggestions";
describe("player token selection", () => {
 it("searches the edited token and excludes other selected names", () => {
  const token=playerToken("Alice; Bo, Carol",9);
  expect(token.query).toBe("Bo");expect(token.excluded).toEqual(["alice","carol"]);
  expect(pickPlayer("Alice; Bo, Carol",9,"Bob").value).toBe("Alice; Bob, Carol");
 });
 it("supports multiline paste, whitespace, end insertion and empty boundary", () => {
  expect(pickPlayer("Alice\n Bo",9,"Bob")).toEqual({value:"Alice\n Bob, ",cursor:12});
  expect(playerToken(",Alice",0).query).toBe("");
  expect(playerToken("Alice, ",7).query).toBe("");
 });
 it("single mode replaces the complete nickname without adding separators", () => {
  expect(pickPlayer("old player",3,"New player",true)).toEqual({value:"New player",cursor:10});
 });
});
