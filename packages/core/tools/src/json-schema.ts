import type { JsonValue } from "@openai-harness/util-values";

export type JsonSchemaScalar = string | number | boolean | null;
export type JsonSchemaType =
  | "object"
  | "array"
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null";

type JsonSchemaScalarType = Exclude<JsonSchemaType, "object" | "array">;

export interface JsonSchemaNode {
  /** Omit with no constraints for any JSON value, or use `oneOf`. */
  type?: JsonSchemaType;
  /** Exactly one branch must validate; at least two branches are required. */
  oneOf?: JsonSchemaNode[];
  /** Nested property schemas (`type: 'object'` only). */
  properties?: Record<string, JsonSchemaNode>;
  /** Required property names; each must appear in `properties`. */
  required?: string[];
  /** `false` rejects undeclared keys; absent/`true` follows JSON Schema's open default. */
  additionalProperties?: boolean;
  /** Item schema (`type: 'array'` only); absent accepts any JSON item. */
  items?: JsonSchemaNode;
  /** Allowed values for a scalar node. */
  enum?: JsonSchemaScalar[];
  /** The single allowed value for a scalar node. */
  const?: JsonSchemaScalar;
  /** Annotation, ignored for validation. */
  description?: string;
  /** Annotation, ignored for validation. */
  title?: string;
  /** Annotation, ignored for validation but required to be lossless JSON. */
  default?: JsonValue;
  /** Annotation, ignored for validation but required to be lossless JSON. */
  examples?: JsonValue;
}

export type ObjectJsonSchema = JsonSchemaNode & { type: "object" };

export class JsonSchemaError extends Error {
  readonly violations: string[];

  constructor(violations: string[]) {
    super(`unsupported JSON schema: ${violations.join("; ")}`);
    this.name = "JsonSchemaError";
    this.violations = violations;
  }
}

const CONSTRAINT_KEYWORDS = new Set([
  "type",
  "oneOf",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
]);
const ANNOTATION_KEYWORDS = new Set([
  "description",
  "title",
  "default",
  "examples",
]);
const SCHEMA_TYPES: readonly JsonSchemaType[] = [
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
  "null",
];

export function isPlainJsonRecord(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

export function isJsonSchemaRecord(
  value: unknown,
): value is Record<string, unknown> {
  return isPlainJsonRecord(value);
}

export function isPlainJsonArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isJsonNumber(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0)
  );
}

function scalarMatches(
  type: JsonSchemaScalarType,
  value: unknown,
): value is JsonSchemaScalar {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return isJsonNumber(value);
    case "integer":
      return isJsonNumber(value) && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      return false;
  }
}

function isJsonValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (isPlainJsonRecord(value)) {
    return Object.values(value).every(isJsonValue);
  }
  return false;
}

export function assertSupportedJsonSchema(
  schema: unknown,
): asserts schema is JsonSchemaNode {
  const violations: string[] = [];
  const seen = new Set<object>();

  function walk(node: unknown, path: string): void {
    if (!isJsonSchemaRecord(node)) {
      violations.push(`${path} must be a schema object`);
      return;
    }
    if (seen.has(node)) {
      violations.push(`${path} is circular`);
      return;
    }
    seen.add(node);

    for (const key of Object.keys(node)) {
      if (CONSTRAINT_KEYWORDS.has(key)) continue;
      if (ANNOTATION_KEYWORDS.has(key)) {
        if (!isJsonValue(node[key])) {
          violations.push(
            `${path}.${key} annotation must be lossless JSON data`,
          );
        }
        continue;
      }
      violations.push(
        `${path}.${key} is not a supported keyword (subset: type/oneOf/properties/required/additionalProperties/items/enum/const + annotations)`,
      );
    }

    if (
      Object.hasOwn(node, "description") &&
      typeof node.description !== "string"
    ) {
      violations.push(`${path}.description must be a string`);
    }
    if (Object.hasOwn(node, "title") && typeof node.title !== "string") {
      violations.push(`${path}.title must be a string`);
    }

    const hasType = Object.hasOwn(node, "type");
    const hasOneOf = Object.hasOwn(node, "oneOf");
    if (hasType && hasOneOf) {
      violations.push(`${path} cannot declare both type and oneOf`);
      return;
    }
    if (!hasType && !hasOneOf) {
      return;
    }

    if (hasOneOf) {
      const oneOf = node.oneOf;
      if (!isPlainJsonArray(oneOf) || oneOf.length < 2) {
        violations.push(
          `${path}.oneOf must be an array of at least two schemas`,
        );
      } else {
        oneOf.forEach((branch, idx) => walk(branch, `${path}.oneOf[${idx}]`));
      }
      return;
    }

    const type = node.type;
    if (
      typeof type !== "string" ||
      !(SCHEMA_TYPES as readonly unknown[]).includes(type)
    ) {
      violations.push(
        Array.isArray(type)
          ? `${path}.type must be a single type string (type arrays are not supported)`
          : `${path}.type must be one of ${SCHEMA_TYPES.join("/")}`,
      );
      return;
    }

    const schemaType = type as JsonSchemaType;
    if (schemaType === "object") {
      if (Object.hasOwn(node, "properties")) {
        const properties = node.properties;
        if (!isJsonSchemaRecord(properties)) {
          violations.push(`${path}.properties must be an object of schemas`);
        } else {
          for (const [key, propNode] of Object.entries(properties)) {
            walk(propNode, `${path}.properties.${key}`);
          }
        }
      }
      if (Object.hasOwn(node, "required")) {
        const required = node.required;
        if (
          !isPlainJsonArray(required) ||
          required.some((e) => typeof e !== "string")
        ) {
          violations.push(`${path}.required must be an array of strings`);
        }
      }
      if (
        Object.hasOwn(node, "additionalProperties") &&
        typeof node.additionalProperties !== "boolean"
      ) {
        violations.push(`${path}.additionalProperties must be a boolean`);
      }
    } else if (schemaType === "array") {
      if (Object.hasOwn(node, "items")) {
        walk(node.items, `${path}.items`);
      }
    } else {
      if (Object.hasOwn(node, "enum")) {
        const allowed = node.enum;
        if (
          !isPlainJsonArray(allowed) ||
          allowed.length === 0 ||
          !allowed.every((entry) => scalarMatches(schemaType, entry))
        ) {
          violations.push(
            `${path}.enum must be a non-empty array of ${schemaType} values`,
          );
        }
      }
      if (Object.hasOwn(node, "const")) {
        const declaredConst = node.const;
        if (!scalarMatches(schemaType, declaredConst)) {
          violations.push(`${path}.const must be a ${schemaType} value`);
        }
      }
    }
  }

  walk(schema, "schema");
  if (violations.length > 0) throw new JsonSchemaError(violations);
}

export function assertObjectJsonSchema(
  schema: unknown,
): asserts schema is ObjectJsonSchema {
  assertSupportedJsonSchema(schema);
  if (schema.type !== "object") {
    throw new JsonSchemaError([
      'schema.type must be "object" (structured output is object-rooted)',
    ]);
  }
}

export function validateJsonSchemaValue(
  schema: JsonSchemaNode,
  value: unknown,
  path: string = "",
): string[] {
  const violations: string[] = [];
  const targetPath = path === "" ? "arguments" : path;

  if (schema.oneOf) {
    let matched = 0;
    for (const branch of schema.oneOf) {
      if (validateJsonSchemaValue(branch, value, path).length === 0) {
        matched++;
      }
    }
    if (matched !== 1) {
      violations.push(
        `"${targetPath}" must match exactly one oneOf branch (matched ${matched})`,
      );
    }
    return violations;
  }

  if (!schema.type) return violations;

  switch (schema.type) {
    case "string":
      if (typeof value !== "string") {
        violations.push(`"${targetPath}" must be a string`);
      } else {
        if (schema.enum && !schema.enum.includes(value)) {
          violations.push(
            `"${targetPath}" must be one of ${JSON.stringify(schema.enum)}`,
          );
        }
        if (schema.const !== undefined && value !== schema.const) {
          violations.push(
            `"${targetPath}" must be ${JSON.stringify(schema.const)}`,
          );
        }
      }
      break;

    case "number":
      if (!isJsonNumber(value)) {
        violations.push(`"${targetPath}" must be a number`);
      } else {
        if (schema.enum && !schema.enum.includes(value)) {
          violations.push(
            `"${targetPath}" must be one of ${JSON.stringify(schema.enum)}`,
          );
        }
        if (schema.const !== undefined && value !== schema.const) {
          violations.push(
            `"${targetPath}" must be ${JSON.stringify(schema.const)}`,
          );
        }
      }
      break;

    case "integer":
      if (!isJsonNumber(value) || !Number.isInteger(value)) {
        violations.push(`"${targetPath}" must be an integer`);
      } else {
        if (schema.enum && !schema.enum.includes(value)) {
          violations.push(
            `"${targetPath}" must be one of ${JSON.stringify(schema.enum)}`,
          );
        }
        if (schema.const !== undefined && value !== schema.const) {
          violations.push(
            `"${targetPath}" must be ${JSON.stringify(schema.const)}`,
          );
        }
      }
      break;

    case "boolean":
      if (typeof value !== "boolean") {
        violations.push(`"${targetPath}" must be a boolean`);
      } else {
        if (schema.const !== undefined && value !== schema.const) {
          violations.push(
            `"${targetPath}" must be ${JSON.stringify(schema.const)}`,
          );
        }
      }
      break;

    case "null":
      if (value !== null) {
        violations.push(`"${targetPath}" must be null`);
      }
      break;

    case "array":
      if (!Array.isArray(value)) {
        violations.push(`"${targetPath}" must be an array`);
      } else if (schema.items) {
        value.forEach((item, index) => {
          violations.push(
            ...validateJsonSchemaValue(
              schema.items!,
              item,
              `${path}[${index}]`,
            ),
          );
        });
      }
      break;

    case "object":
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        violations.push(`"${targetPath}" must be an object`);
      } else {
        const record = value as Record<string, unknown>;
        if (schema.required) {
          for (const reqKey of schema.required) {
            if (
              !Object.hasOwn(record, reqKey) ||
              record[reqKey] === undefined
            ) {
              violations.push(
                `"${path ? `${path}.${reqKey}` : reqKey}" is required`,
              );
            }
          }
        }
        if (schema.properties) {
          for (const [propKey, propSchema] of Object.entries(
            schema.properties,
          )) {
            if (
              Object.hasOwn(record, propKey) &&
              record[propKey] !== undefined
            ) {
              violations.push(
                ...validateJsonSchemaValue(
                  propSchema,
                  record[propKey],
                  path ? `${path}.${propKey}` : propKey,
                ),
              );
            }
          }
        }
        if (schema.additionalProperties === false && schema.properties) {
          for (const key of Object.keys(record)) {
            if (!Object.hasOwn(schema.properties, key)) {
              violations.push(
                `"${path ? `${path}.${key}` : key}" is not an allowed property`,
              );
            }
          }
        }
      }
      break;
  }

  return violations;
}
