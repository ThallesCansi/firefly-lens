type Reference = {
  authors: string;
  year: string;
  title: string;
  publication: string;
  url: string;
  doi?: string;
};
const references: Record<string, Reference> = {
  modis: {
    authors: "Giglio, L.; Schroeder, W.; Justice, C. O.",
    year: "2016",
    title:
      "The collection 6 MODIS active fire detection algorithm and fire products",
    publication: "Remote Sensing of Environment, 178, 31–41",
    doi: "10.1016/j.rse.2015.12.054",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6110110/",
  },
  viirs: {
    authors: "Schroeder, W.; Oliva, P.; Giglio, L.; Csiszar, I. A.",
    year: "2014",
    title:
      "The New VIIRS 375 m active fire detection data product: Algorithm description and initial assessment",
    publication: "Remote Sensing of Environment, 143, 85–96",
    doi: "10.1016/j.rse.2013.12.008",
    url: "https://doi.org/10.1016/j.rse.2013.12.008",
  },
  firms: {
    authors: "NASA / LANCE FIRMS",
    year: "Living documentation",
    title: "Active Fire Data",
    publication: "Fire Information for Resource Management System",
    url: "https://firms.modaps.eosdis.nasa.gov/content/active_fire/",
  },
  scale: {
    authors: "NIST/SEMATECH",
    year: "Online handbook",
    title: "Measures of Scale",
    publication: "e-Handbook of Statistical Methods, §1.3.5.6",
    url: "https://www.itl.nist.gov/div898/handbook/eda/section3/eda356.htm",
  },
  outliers: {
    authors: "NIST/SEMATECH",
    year: "Online handbook",
    title: "Detection of Outliers",
    publication: "e-Handbook of Statistical Methods, §1.3.5.17",
    url: "https://www.itl.nist.gov/div898/handbook/eda/section3/eda35h.htm",
  },
  mad: {
    authors: "R Core Team",
    year: "Online documentation",
    title: "Median Absolute Deviation",
    publication: "R stats reference manual",
    url: "https://search.r-project.org/R/refmans/stats/html/mad.html",
  },
};
export function References({ ids }: { ids: string[] }) {
  return (
    <section className="method-references" aria-label="Scientific references">
      <h2>Scientific references</h2>
      <p>
        These sources describe the instruments and statistical concepts. They do
        not validate FireFly Lens’s provisional harmonization.
      </p>
      <ol>
        {ids.map((id) => {
          const r = references[id];
          return (
            <li key={id}>
              <p>
                {r.authors} · {r.year}
              </p>
              <a href={r.url} target="_blank" rel="noreferrer">
                {r.title} ↗
              </a>
              <p>
                {r.publication}
                {r.doi && (
                  <>
                    {" "}
                    · <a href={`https://doi.org/${r.doi}`}>DOI: {r.doi}</a>
                  </>
                )}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
