import { expect, it } from "vitest";
import { personIdentityNames } from "./formatPersonIdentity";

it("uses the profile name, public Discord and Winamax without adding separators", () => {
  expect(personIdentityNames({profileName:" Alex ",discord:" Public Alex ",winamax:" Wina "}))
    .toEqual({name:"Alex",discord:"Public Alex",winamax:"Wina"});
});
it("falls back to Discord and does not repeat the same identity", () => {
  expect(personIdentityNames({discord:"Discord"})).toEqual({name:"Discord",discord:"",winamax:""});
  expect(personIdentityNames({profileName:"Alex",discord:" alex "})).toEqual({name:"Alex",discord:"",winamax:""});
  expect(personIdentityNames({})).toEqual({name:"—",discord:"",winamax:""});
});
