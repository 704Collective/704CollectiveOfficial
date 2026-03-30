export type JsonLdProps = {
  /** Any JSON-serializable schema.org object (or array of objects). */
  schema: object | object[];
};

/**
 * Renders JSON-LD for search engines. Pass a single schema object or an array
 * (e.g. Organization + WebPage).
 */
export default function JsonLd({ schema }: JsonLdProps) {
  const json = Array.isArray(schema) ? schema : schema;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}
