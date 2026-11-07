import { expect, it } from "vitest";
import { personIdentityNames } from "./formatPersonIdentity";

it("prioritizes public Discord, then profile name, with Winamax below", () => {
  expect(personIdentityNames({profileName:" Alex ",discord:" Public Alex ",winamax:" Wina "}))
    .toEqual({primary:"Public Alex",secondary:"Alex",winamax:"Wina"});
});
it("falls back to Discord and does not repeat the same identity", () => {
  expect(personIdentityNames({discord:"Discord"})).toEqual({primary:"Discord",secondary:"",winamax:""});
  expect(personIdentityNames({profileName:"Alex",discord:" alex "})).toEqual({primary:"alex",secondary:"",winamax:""});
  expect(personIdentityNames({profileName:"Alex"})).toEqual({primary:"Alex",secondary:"",winamax:""});
  expect(personIdentityNames({})).toEqual({primary:"—",secondary:"",winamax:""});
});
