/** Schéma JSON (déjà résolu par l'API, sans `$ref`) affiché en arbre de champs lisible. */

type Schema = Record<string, unknown>;
const MAX_DEPTH = 4;

function asSchema(value: unknown): Schema {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Schema) : {};
}

/** `anyOf: [{type: string}, {type: null}]` → schéma de la branche non nulle + facultatif. */
function unwrap(schema: Schema): { schema: Schema; nullable: boolean } {
  const variants = (schema.anyOf ?? schema.oneOf) as unknown[] | undefined;
  if (Array.isArray(variants)) {
    const nonNull = variants.map(asSchema).filter((v) => v.type !== "null");
    if (nonNull.length === 1) return { schema: { ...schema, ...nonNull[0], anyOf: undefined, oneOf: undefined }, nullable: nonNull.length < variants.length };
  }
  return { schema, nullable: false };
}

function typeLabel(schema: Schema): string {
  if (Array.isArray(schema.enum)) return schema.enum.map(String).join(" | ");
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  const type = Array.isArray(schema.type) ? schema.type.join(" | ") : String(schema.type ?? (schema.properties ? "object" : "—"));
  if (type === "array") return `${typeLabel(asSchema(schema.items))}[]`;
  return schema.format ? `${type} (${String(schema.format)})` : type;
}

function constraints(schema: Schema): string[] {
  const out: string[] = [];
  if (schema.minimum !== undefined) out.push(`≥ ${String(schema.minimum)}`);
  if (schema.maximum !== undefined) out.push(`≤ ${String(schema.maximum)}`);
  if (schema.minLength !== undefined) out.push(`${String(schema.minLength)} car. min.`);
  if (schema.maxLength !== undefined) out.push(`${String(schema.maxLength)} car. max.`);
  if (schema.maxItems !== undefined) out.push(`${String(schema.maxItems)} éléments max.`);
  if (schema.pattern !== undefined) out.push(`motif ${String(schema.pattern)}`);
  if (schema.default !== undefined) out.push(`défaut ${JSON.stringify(schema.default)}`);
  return out;
}

function Fields({ schema, depth }: { schema: Schema; depth: number }) {
  const properties = asSchema(schema.properties);
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  const names = Object.keys(properties);
  if (names.length === 0) return null;
  return (
    <ul className={depth > 0 ? "mt-1 ml-4 border-l border-slate-200 pl-3 dark:border-slate-800" : ""}>
      {names.map((name) => {
        const { schema: field, nullable } = unwrap(asSchema(properties[name]));
        const child = field.type === "array" ? unwrap(asSchema(field.items)).schema : field;
        return (
          <li key={name} className="py-1 text-sm">
            <code className="font-semibold">{name}</code>
            {required.has(name) ? <span className="ml-1 text-red-700 dark:text-red-400" title="Obligatoire">*</span> : null}
            <span className="ml-2 font-mono text-xs text-slate-500">{typeLabel(field)}{nullable ? " | null" : ""}</span>
            {constraints(field).length ? <span className="ml-2 text-xs text-slate-500">{constraints(field).join(" · ")}</span> : null}
            {typeof field.description === "string" ? <p className="text-xs text-slate-600 dark:text-slate-400">{field.description}</p> : null}
            {depth < MAX_DEPTH && child.properties ? <Fields schema={child} depth={depth + 1} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function SchemaView({ schema }: { schema: unknown }) {
  const root = unwrap(asSchema(schema)).schema;
  const target = root.type === "array" ? unwrap(asSchema(root.items)).schema : root;
  return target.properties ? <Fields schema={target} depth={0} /> : <p className="font-mono text-xs">{typeLabel(root)}</p>;
}
