import { fail, RuleError, type RuleIssue } from "./error.ts";

type Path = Array<number | string>;
type Read<Output> = (value: unknown, path: Path) => Output;
type Initial<Output> = () => Output;

export type RuleKind =
  | "array"
  | "bigint"
  | "boolean"
  | "bytes"
  | "date"
  | "enum"
  | "id"
  | "int"
  | "json"
  | "many"
  | "number"
  | "object"
  | "one"
  | "password"
  | "ref"
  | "string"
  | "unknown"
  | "uuid";

type RuleValue = { _output: unknown };

export type RuleShape = Record<string, Rule<any>>;
export type OutputShape = Record<string, RuleValue>;
export type RuleOutput<Value> = Value extends { _output: infer Output }
  ? Output
  : never;

type OptionalKey<Value extends OutputShape> = {
  [Key in keyof Value]: undefined extends RuleOutput<Value[Key]>
    ? Key
    : never;
}[keyof Value];

type RequiredKey<Value extends OutputShape> = Exclude<
  keyof Value,
  OptionalKey<Value>
>;

export type ShapeOutput<Value extends OutputShape> = {
  [Key in RequiredKey<Value>]: RuleOutput<Value[Key]>;
} & {
  [Key in OptionalKey<Value>]?: RuleOutput<Value[Key]>;
};

function copy<Value>(value: Value): Value {
  if (value === undefined || value === null) return value;
  if (typeof value !== "object") return value;
  return structuredClone(value);
}

export class Rule<Output = unknown> {
  declare readonly _output: Output;
  private custom = false;
  private fallback?: Output | null;
  private nulls = false;
  private option = false;
  private demand = false;

  constructor(
    readonly kind: RuleKind,
    private readonly initial: Initial<Output>,
    private readonly read: Read<Output>,
  ) {}

  parse(value: unknown): Output {
    return this.readValue(value, []);
  }

  safeParse(value: unknown):
    | { data: Output; success: true }
    | { error: RuleError; success: false } {
    try {
      return { data: this.parse(value), success: true };
    } catch (error) {
      if (error instanceof RuleError) return { error, success: false };
      throw error;
    }
  }

  async parseAsync(value: unknown): Promise<Output> {
    return this.parse(value);
  }

  readValue(value: unknown, path: Path): Output {
    if (value === undefined) {
      if (this.demand) fail("required", "A value is required.", path);
      if (this.option) return undefined as Output;
      if (this.custom) value = copy(this.fallback);
      else if (this.nulls) return null as Output;
      else value = this.initial();
    }
    if (value === null) {
      if (this.nulls) return null as Output;
      fail("type", `Expected ${this.kind}.`, path);
    }
    return this.read(value, path);
  }

  required(): Rule<Exclude<Output, undefined>> {
    this.demand = true;
    this.option = false;
    return this as Rule<Exclude<Output, undefined>>;
  }

  optional(): Rule<Output | undefined> {
    this.option = true;
    this.demand = false;
    return this as Rule<Output | undefined>;
  }

  nullable(): Rule<Output | null> {
    this.nulls = true;
    return this as Rule<Output | null>;
  }

  default(value: Output): Rule<Exclude<Output, undefined>>;
  default(value: null): Rule<Output | null>;
  default(value: Output | null): Rule<Output | null> {
    this.custom = true;
    this.fallback = value;
    if (value === null) this.nulls = true;
    return this as Rule<Output | null>;
  }

  auto(): this {
    return this;
  }

  db(_type: "Text"): this {
    return this;
  }

  defaultRaw(_value: string): this {
    return this;
  }

  id(): this {
    return this;
  }

  index(): this {
    return this;
  }

  unique(): this {
    return this;
  }

  map(_name: string): this {
    return this;
  }

  updated(): this {
    return this;
  }
}

type TextStep = (value: string, path: Path) => string;

export class StringRule extends Rule<string> {
  private lowerBound: number;
  private upperBound?: number;
  private steps: TextStep[] = [];

  constructor(
    min = 0,
    max?: number,
    kind: "password" | "string" = "string",
  ) {
    super(kind, () => "", (value, path) => {
      if (typeof value !== "string") {
        fail("type", "Expected a string.", path);
      }
      let output = value;
      for (const step of this.steps) output = step(output, path);
      if (output.length < this.lowerBound) {
        fail("min", `Expected at least ${this.lowerBound} characters.`, path);
      }
      if (this.upperBound !== undefined && output.length > this.upperBound) {
        fail("max", `Expected at most ${this.upperBound} characters.`, path);
      }
      return output;
    });
    this.lowerBound = min;
    this.upperBound = max;
  }

  min(value: number): this {
    this.lowerBound = value;
    return this;
  }

  max(value: number): this {
    this.upperBound = value;
    return this;
  }

  trim(): this {
    this.steps.push((value) => value.trim());
    return this;
  }

  lower(): this {
    this.steps.push((value) => value.toLowerCase());
    return this;
  }

  upper(): this {
    this.steps.push((value) => value.toUpperCase());
    return this;
  }

  email(): this {
    this.steps.push((value, path) => (
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ? value
        : fail("email", "Expected an email address.", path)
    ));
    return this;
  }

  regex(pattern: RegExp): this {
    this.steps.push((value, path) => {
      pattern.lastIndex = 0;
      return pattern.test(value)
        ? value
        : fail("regex", "String format is invalid.", path);
    });
    return this;
  }

}

type NumberStep = (value: number, path: Path) => number;

export class NumberRule extends Rule<number> {
  private cast = false;
  private integer: boolean;
  private lowerBound?: number;
  private upperBound?: number;
  private steps: NumberStep[] = [];

  constructor(kind: "int" | "number", min?: number, max?: number) {
    super(kind, () => 0, (input, path) => {
      const value = this.cast ? Number(input) : input;
      if (typeof value !== "number" || Number.isNaN(value)) {
        fail("type", "Expected a number.", path);
      }
      if (this.integer && !Number.isInteger(value)) {
        fail("int", "Expected an integer.", path);
      }
      if (this.lowerBound !== undefined && value < this.lowerBound) {
        fail(
          "min",
          `Expected a number greater than or equal to ${this.lowerBound}.`,
          path,
        );
      }
      if (this.upperBound !== undefined && value > this.upperBound) {
        fail(
          "max",
          `Expected a number less than or equal to ${this.upperBound}.`,
          path,
        );
      }
      return this.steps.reduce((current, step) => step(current, path), value);
    });
    this.integer = kind === "int";
    this.lowerBound = min;
    this.upperBound = max;
  }

  coerce(): this {
    this.cast = true;
    return this;
  }

  int(): this {
    this.integer = true;
    return this;
  }

  min(value: number): this {
    this.lowerBound = value;
    return this;
  }

  max(value: number): this {
    this.upperBound = value;
    return this;
  }

  positive(): this {
    this.steps.push((value, path) => value > 0
      ? value
      : fail("positive", "Expected a positive number.", path));
    return this;
  }
}

export class BooleanRule extends Rule<boolean> {
  private cast = false;

  constructor() {
    super("boolean", () => false, (input, path) => {
      if (this.cast && (input === "true" || input === "false")) {
        return input === "true";
      }
      return typeof input === "boolean"
        ? input
        : fail("type", "Expected a boolean.", path);
    });
  }

  coerce(): this {
    this.cast = true;
    return this;
  }
}

export class DateRule extends Rule<Date> {
  private cast = false;

  constructor() {
    super("date", () => new Date(), (input, path) => {
      const value = this.cast && !(input instanceof Date)
        ? new Date(input as string | number)
        : input;
      return value instanceof Date && !Number.isNaN(value.valueOf())
        ? value
        : fail("type", "Expected a date.", path);
    });
  }

  coerce(): this {
    this.cast = true;
    return this;
  }
}

export class IdRule extends Rule<bigint> {
  constructor(readonly start = 1) {
    if (!Number.isSafeInteger(start) || start < 1) {
      throw new RangeError("An ID start must be a positive safe integer.");
    }
    super(
      "id",
      () => 0n,
      (value, path) => typeof value === "bigint"
        ? value
        : fail("type", "Expected an id.", path),
    );
  }
}

export class ArrayRule<Item> extends Rule<Item[]> {
  private lowerBound: number;
  private upperBound?: number;

  constructor(item: Rule<Item>, min = 0, max?: number) {
    super("array", () => [], (input, path) => {
      if (!Array.isArray(input)) fail("type", "Expected an array.", path);
      if (input.length < this.lowerBound) {
        fail("min", `Expected at least ${this.lowerBound} items.`, path);
      }
      if (this.upperBound !== undefined && input.length > this.upperBound) {
        fail("max", `Expected at most ${this.upperBound} items.`, path);
      }
      return input.map((value, index) => item.readValue(value, [...path, index]));
    });
    this.lowerBound = min;
    this.upperBound = max;
  }

  min(value: number): this {
    this.lowerBound = value;
    return this;
  }

  max(value: number): this {
    this.upperBound = value;
    return this;
  }
}

export class ModelRule<Value extends RuleShape> {
  constructor(readonly fields: Value) {}

  unique(..._fields: Array<keyof Value & string>): this {
    return this;
  }

  index(..._fields: Array<keyof Value & string>): this {
    return this;
  }
}

type ObjectOptions = {
  passthrough: boolean;
};

type ObjectOutput<
  Value extends RuleShape,
  Extra extends boolean,
> = ShapeOutput<Value> & (Extra extends true
  ? Record<string, unknown>
  : unknown);

export class ObjectRule<
  Value extends RuleShape,
  Extra extends boolean = false,
> extends Rule<ObjectOutput<Value, Extra>> {
  private readonly options: ObjectOptions;

  constructor(
    readonly fields: Value,
    options: ObjectOptions = { passthrough: false },
  ) {
    const settings = { ...options };
    super("object", () => {
      const output: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(fields)) {
        output[key] = value.readValue(undefined, [key]);
      }
      return output as ObjectOutput<Value, Extra>;
    }, (input, path) => {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        fail("type", "Expected an object.", path);
      }
      const source = input as Record<string, unknown>;
      const output: Record<string, unknown> = settings.passthrough
        ? { ...source }
        : {};
      for (const [key, value] of Object.entries(fields)) {
        const next = value.readValue(source[key], [...path, key]);
        if (next !== undefined) output[key] = next;
        else delete output[key];
      }
      return output as ObjectOutput<Value, Extra>;
    });
    this.options = settings;
  }

  extend<Next extends RuleShape>(fields: Next): ObjectRule<Value & Next, Extra> {
    return new ObjectRule({ ...this.fields, ...fields }, this.options);
  }

  passthrough(): ObjectRule<Value, true> {
    this.options.passthrough = true;
    return this as unknown as ObjectRule<Value, true>;
  }
}

function string(first?: number, second?: number) {
  return second === undefined
    ? new StringRule(0, first)
    : new StringRule(first, second);
}

function number(kind: "int" | "number", first?: number, second?: number) {
  return second === undefined
    ? new NumberRule(kind, undefined, first)
    : new NumberRule(kind, first, second);
}

function object<Value extends RuleShape>(shape: Value) {
  return new ObjectRule(shape);
}

function relation(kind: "many" | "one" | "ref") {
  if (kind === "many") {
    return new Rule<unknown[]>(kind, () => [], (value, path) => (
      Array.isArray(value) ? value : fail("type", "Expected an array.", path)
    ));
  }
  return new Rule<unknown>(kind, () => (
    fail("required", "A relation value is required.", [])
  ), (value) => value);
}

function uuid() {
  const create = () => {
    const runtime = globalThis as typeof globalThis & {
      Bun?: { randomUUIDv7?: () => string };
    };
    return runtime.Bun?.randomUUIDv7?.() || crypto.randomUUID();
  };
  return new Rule<string>("uuid", create, (value, path) => (
    typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value)
      ? value
      : fail("uuid", "Expected a UUID.", path)
  ));
}

export const rule = {
  any: () => new Rule<unknown>("unknown", () => undefined, value => value),
  array: <Item>(item: Rule<Item>, min = 0, max?: number) => (
    new ArrayRule(item, min, max)
  ),
  boolean: () => new BooleanRule(),
  bigint: () => new Rule<bigint>(
    "bigint",
    () => 0n,
    (value, path) => typeof value === "bigint"
      ? value
      : fail("type", "Expected a bigint.", path),
  ),
  bytes: () => new Rule<Uint8Array>(
    "bytes",
    () => new Uint8Array(),
    (value, path) => value instanceof Uint8Array
      ? value
      : fail("type", "Expected bytes.", path),
  ),
  date: () => new DateRule(),
  email: (max = 320) => string(max).trim().lower().email(),
  enum: <const Value extends readonly string[]>(values: Value) => {
    const allowed = new Set<string>(values);
    return new Rule<Value[number]>(
      "enum",
      () => values[0] ?? fail("enum", "An enum needs a value.", []),
      (value, path) => typeof value === "string" && allowed.has(value)
        ? value as Value[number]
        : fail("enum", "Expected one of the allowed values.", path),
    );
  },
  id: (start = 1) => new IdRule(start),
  int: (first?: number, second?: number) => (
    number("int", first, second)
  ),
  initial: <Value extends RuleShape>(shape: Value) => initial(shape),
  json: () => new Rule<unknown>("json", () => ({}), (value) => value),
  many: (_target: string, _ref: string) => relation("many"),
  model: <Value extends RuleShape>(fields: Value) => new ModelRule(fields),
  number: (first?: number, second?: number) => (
    number("number", first, second)
  ),
  object,
  one: (_target: string, _ref: string) => relation("one").nullable(),
  password: (max = 255) => new StringRule(0, max, "password"),
  ref: (_target: string) => relation("ref"),
  string,
  uuid,
};

export const r = rule;

export function initial<Value extends RuleShape>(shape: Value): ShapeOutput<Value> {
  return object(shape).parse(undefined);
}

export { RuleError, type RuleIssue };
