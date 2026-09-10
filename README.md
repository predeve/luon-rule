# @luon/rule

Part of [Luon](https://www.luon.dev) — Lightweight value formats and database schema rules for Luon.

[Package guide](https://pkg.luon.dev/packages/rule/) ·
[Source](https://github.com/predeve/luon-rule) ·
[Developer tools](https://www.luon.dev/tools)

Define the shape once. Parse values or inspect validation errors.

```ts
import { r } from "@luon/rule";

const Contact = r.object({
  email: r.email(160).required(),
  name: r.string(1, 80).trim(),
});

const result = Contact.safeParse({
  email: "hello@example.com",
  name: "  Luon  ",
});

if (result.success) console.log(result.data.name); // "Luon"
```

Read the implementation: [rules and parsing](src/index.ts).

## Install

```bash
bun add @luon/rule --registry https://pkg.luon.dev
```

## Who it is for

Use Rule when data crosses a boundary or becomes a database field. Start with the tables below, copy the closest example, and open the API surface only when you need a less common modifier.

## Core concepts

### Inside a Luon Site

rule, r, and Input are available globally. Export config.filter in an API or task file when Runtime should validate input before the handler runs.

### Outside a Luon Site

Import rule or r and RuleOutput from @luon/rule. The package has no runtime dependencies and works in Bun and browsers.

### Missing is deliberate

Every format has a natural initial value. Add required, optional, nullable, or default only when the boundary needs different behavior.

### The owner uses ref

A ref field owns the foreign key and index. one and many are reverse fields that point back to the owning ref field.

## Quick reference

### Everyday formats

For text and numbers, one bound is the maximum and two are the minimum and maximum. Arrays take minimum, then maximum.

| Format | Output | Missing value | Use |
| --- | --- | --- | --- |
| r.string(max?) | string | "" | Text |
| r.email(max?) | string | error unless optional | Email |
| r.int(max?) / r.int(min, max) | number | 0 | Whole numbers |
| r.number(max?) / r.number(min, max) | number | 0 | Decimals |
| r.boolean() | boolean | false | Flags |
| r.enum(values) | string union | first value | Fixed choices |
| r.uuid() | string | generated UUID | Identity |
| r.date() | Date | now | Dates and timestamps |
| r.array(item, min?, max?) | Item[] | [] | Lists |
| r.object(shape) | object | field initials | Nested input |

### Parsing and missing values

Choose the boundary behavior explicitly before parsing input.

| Syntax | Result |
| --- | --- |
| .parse(value) | Return normalized data or throw RuleError |
| .safeParse(value) | Return a success union with data or issues |
| .required() | Reject undefined input |
| .optional() | Allow undefined and omit the object key |
| .nullable() | Allow null and use null when missing |
| .default(value) | Replace the natural missing value |

### Database essentials

Keep ownership and indexes beside the fields they describe.

| Syntax | Database result |
| --- | --- |
| r.id(start?) | BIGINT primary key with a sequence |
| r.uuid().id() | Generated UUID primary key |
| r.ref("User") | Foreign key scalar and index |
| r.one("Profile", "user") | Reverse one-to-one field |
| r.many("Post", "author") | Reverse one-to-many field |
| .unique() / .index() | Single-field constraint or index |
| rule.model(fields) | Composite unique and index support |

## Examples

### Validate Site API input

A Luon API can publish its filter and receive typed input directly.

```ts
export const config = {
  filter: {
    page: r.int(1, 10_000).coerce(),
    take: r.int(1, 100).coerce(),
    search: r.string(80).trim(),
  },
};

export default async (input: Input<typeof config.filter>) => {
  return db.post.findMany({
    take: input.take,
    skip: (input.page - 1) * input.take,
  });
};
```

### Parse form data safely

safeParse keeps expected validation errors out of exception flow.

```ts
import { rule, type RuleOutput } from "@luon/rule";

const ContactRule = rule.object({
  email: rule.email(160).required(),
  message: rule.string(1, 2_000).trim(),
});

type Contact = RuleOutput<typeof ContactRule>;
const input = Object.fromEntries(new FormData(form));
const result = ContactRule.safeParse(input);

if (!result.success) showIssues(result.error.issues);
else await send(result.data);
```

### Define database fields

Relations name the target model and the owning ref field.

```ts
export const User = rule.model({
  id: r.id(),
  email: r.string(160).unique(),
  posts: r.many("Post", "author"),
});

export const Post = {
  id: r.id(),
  author: r.ref("User"),
  title: r.string(120).index(),
};
```

### Reuse a base object

extend shares declared fields while passthrough preserves DOM props.

```ts
const base = r.object({
  disabled: r.boolean(),
  class: r.any().optional(),
}).passthrough();

const button = base.extend({
  size: r.enum(["sm", "md", "lg"]).default("md"),
});

const props = button.parse(input);
```

## API reference

### `rule / r`

Identical factories for scalar, object, and database rules.

### `string / email / password`

Text formats with length, normalization, and database intent.

### `number / int / bigint`

Numeric formats; transport coercion is explicit.

### `boolean / date`

Native values with optional string coercion.

### `enum / uuid / bytes / json / any`

Choices, identities, binary values, JSON, and unconstrained input.

### `array(item, min?, max?)`

Validate every item and retain its indexed issue path.

### `object(shape)`

Parse declared keys and infer the complete object output.

### `extend / passthrough`

Compose object fields or preserve undeclared keys.

### `Rule.parse(value)`

Return normalized output or throw RuleError.

### `Rule.safeParse(value)`

Return a success union for expected errors.

### `Rule.parseAsync(value)`

Return the same parsed result through a Promise.

### `required / optional / nullable / default`

Replace the format's natural missing-value behavior.

### `trim / lower / upper / regex`

Normalize or constrain strings before accepting them.

### `min / max / positive / int / coerce`

Constrain numbers and convert explicit transport values.

### `rule.model(fields)`

Add database model and composite constraints.

### `id / ref / one / many`

Describe primary keys, relation owners, and reverse fields.

### `id / auto / unique / index`

Mark database keys, sequences, constraints, and indexes.

### `db / defaultRaw / map / updated`

Set advanced PostgreSQL storage and update behavior.

### `initial(shape)`

Create typed initial output from a field shape.

### `RuleOutput / ShapeOutput`

Infer parsed TypeScript output from a Rule or shape.

### `RuleError / RuleIssue`

Read validation codes, messages, and nested field paths.

## Runtime flow

1. Use the global r inside a Luon Site or import rule in another project.
2. Choose the narrowest format and keep bounds beside the field.
3. Add trim, lower, coerce, or another explicit normalization step.
4. Choose required, optional, nullable, or a domain default.
5. Parse at the boundary and use the inferred output after it succeeds.

## Boundaries

- rule and r are the same object; Luon Sites also receive them globally.
- Rule is not a Zod compatibility layer.
- email trims and lowercases input before validating the address.
- BigInt input uses native bigint values and is not coerced from JSON.
- A ref creates the scalar foreign-key field and its single-column index.
- A password field marks the database column; normal writes must still hash the value with auth.password.hash.

## More documentation

- [View language](https://docs.luon.dev/frontend/view)
- [Database models](https://docs.luon.dev/server/database)

## License

[MIT](LICENSE) © predeve
