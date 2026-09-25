import { describe, expect, it } from "vitest";
import { buildCitationIndex } from "./Cite";

const books = [
  {
    title: "Practical Packet Analysis",
    chapters: ["Capítulo 5: Internet Protocol"],
    competencies: ["Decodificar IPv4"],
    abbr: "PPA",
  },
  {
    title: "Zero Trust Networks",
    chapters: ["Capítulo 2: Managing Trust"],
    competencies: ["Diseñar mTLS"],
    abbr: "ZTN",
  },
];

describe("citation index", () => {
  it("assigns one reading-order number per cited locator and retains bibliographic context", () => {
    const index = buildCitationIndex(
      ["IPv4 se enruta por prefijo. [PPA, cap. 5]", "mTLS autoriza identidad. [ZTN, cap. 2; PPA, cap. 5]"],
      books,
    );

    expect([...index.values()]).toMatchObject([
      { number: 1, reference: "PPA, cap. 5", detail: expect.stringContaining("Chris Sanders") },
      { number: 2, reference: "ZTN, cap. 2", detail: expect.stringContaining("Zero Trust Networks") },
    ]);
  });
});
