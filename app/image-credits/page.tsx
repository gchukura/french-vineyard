import { LegalPage, legalMetadata, type LegalDef } from "@/components/page/LegalPage";
import { usedOn } from "@/lib/credit";
import { getImages } from "@/lib/sheets";

const DEF: LegalDef = { key: "image_credits_mdx", title: "Image credits", path: "/image-credits/" };

export const generateMetadata = () => legalMetadata(DEF);

/**
 * Every row of the Images tab, whatever its status: an image may be on a
 * page before its row is tidied up, and it still needs its credit.
 * image_credits_mdx in Config adds an optional intro.
 */
export default async function ImageCredits() {
  const images = await getImages({ includeDrafts: true });
  return (
    <LegalPage def={DEF}>
      {images.length ? (
        <div className="mt-8 overflow-x-auto rounded-card border border-accent/40">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Image credits</caption>
            <thead>
              <tr className="border-b border-accent/40 text-left">
                {["Image", "Credit", "Licence", "Used on"].map((h) => (
                  <th key={h} scope="col" className="px-4 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {images.map((img, i) => (
                <tr key={`${img.url}-${i}`} className="odd:bg-surface">
                  <th scope="row" className="px-4 py-2 text-left font-medium">
                    {img.alt || img.url.split("/").pop()}
                  </th>
                  <td className="px-4 py-2">
                    {img.source_url ? (
                      <a
                        href={img.source_url}
                        rel="noopener"
                        target="_blank"
                        className="underline underline-offset-2"
                      >
                        {img.credit || "Source"}
                      </a>
                    ) : (
                      img.credit || "—"
                    )}
                  </td>
                  <td className="px-4 py-2">{img.license || "—"}</td>
                  <td className="px-4 py-2">
                    {usedOn(img.used_on).length
                      ? usedOn(img.used_on).map((page) =>
                          page.startsWith("/") ? (
                            <a
                              key={page}
                              href={page}
                              className="block py-1 underline underline-offset-2"
                            >
                              {page}
                            </a>
                          ) : (
                            <span key={page} className="block">
                              {page}
                            </span>
                          ),
                        )
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-8 text-muted">No images are listed yet.</p>
      )}
    </LegalPage>
  );
}
