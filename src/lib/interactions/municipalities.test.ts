import { describe, expect, it } from "vitest";
import { MunicipalityRepository, searchMunicipalities, type Municipality } from "./municipalities";

const index: Municipality[] = [
  { id: 5107925, name: "Sorriso", uf: "MT" },
  { id: 5002209, name: "Bonito", uf: "MS" },
  { id: 2602308, name: "Bonito", uf: "PE" },
  { id: 3550308, name: "São Paulo", uf: "SP" },
  { id: 3550407, name: "São Paulo das Missões", uf: "RS" },
  { id: 5002704, name: "Campo Grande", uf: "MS" },
  { id: 1508100, name: "Porto de Moz", uf: "PA" },
  { id: 4314902, name: "Porto Alegre", uf: "RS" },
];
const names = (query: string) => searchMunicipalities(index, query).map((m) => `${m.name}/${m.uf}`);

describe("searchMunicipalities", () => {
  it("ignores accents and case, and puts the exact name first", () => {
    expect(names("sao paulo")).toEqual(["São Paulo/SP", "São Paulo das Missões/RS"]);
    expect(names("SORRISO")).toEqual(["Sorriso/MT"]);
  });

  it("narrows by a trailing state code", () => {
    expect(names("Bonito")).toEqual(["Bonito/MS", "Bonito/PE"]);
    expect(names("Bonito, PE")).toEqual(["Bonito/PE"]);
    expect(names("campo grande ms")).toEqual(["Campo Grande/MS"]);
  });

  it("does not read an ordinary two-letter word as a state", () => {
    expect(names("Porto de")).toEqual(["Porto de Moz/PA"]);
  });

  it("matches the start of the name or of a later word", () => {
    expect(names("porto")).toEqual(["Porto Alegre/RS", "Porto de Moz/PA"]);
    expect(names("grande")).toEqual(["Campo Grande/MS"]);
    expect(names("s")).toEqual([]);
  });
});

describe("MunicipalityRepository", () => {
  const square = { type: "Polygon", coordinates: [[[-56, -13], [-55, -13], [-55, -12], [-56, -12], [-56, -13]]] };
  const files: Record<string, unknown> = {
    "/interaction-boundaries/municipalities/index.json": [[5107925, "Sorriso", "MT"]],
    "/interaction-boundaries/municipalities/51.geojson": {
      features: [{ properties: { id: "5107925", name: "Sorriso", uf: "MT" }, geometry: square }],
    },
  };
  const calls: string[] = [];
  const fetcher = (async (url: string) => {
    calls.push(url);
    return url in files ? new Response(JSON.stringify(files[url])) : new Response("", { status: 404 });
  }) as typeof fetch;

  it("reads the index and builds an area from the state's file, fetched once", async () => {
    const repository = new MunicipalityRepository(fetcher);
    expect(await repository.index()).toEqual([{ id: 5107925, name: "Sorriso", uf: "MT" }]);
    const area = await repository.area(5107925);
    expect(area).toMatchObject({ id: "municipality:5107925", name: "Sorriso, MT", kind: "municipality", bbox: [-56, -13, -55, -12] });
    await repository.area("5107925");
    expect(calls.filter((url) => url.endsWith("51.geojson"))).toHaveLength(1);
  });

  it("answers null for a code that is malformed or not in the file", async () => {
    const repository = new MunicipalityRepository(fetcher);
    expect(await repository.area("51")).toBeNull();
    expect(await repository.area(5100000)).toBeNull();
  });
});
