import type { ContentBlock } from "@openai-harness/llm";
import type { JsonValue } from "@openai-harness/util-values";
import type { ToolDefinition, ToolResult, ToolRunContext } from "./types";
import { ToolArgsError } from "./types";
import {
  validateJsonSchemaValue,
  type JsonSchemaNode,
  type JsonSchemaScalar,
  type ObjectJsonSchema,
} from "./json-schema";
import type { ToolCallView, ToolResultView } from "./presentation";

export interface ValueSchemaAnnotations {
  title?: string;
  description?: string;
  default?: JsonValue;
  examples?: JsonValue;
}

export interface StringValueSchemaSpec extends ValueSchemaAnnotations {
  type: "string";
  enum?: readonly string[];
  const?: string;
}

export interface NumberValueSchemaSpec extends ValueSchemaAnnotations {
  type: "number";
  enum?: readonly number[];
  const?: number;
}

export interface IntegerValueSchemaSpec extends ValueSchemaAnnotations {
  type: "integer";
  enum?: readonly number[];
  const?: number;
}

export interface BooleanValueSchemaSpec extends ValueSchemaAnnotations {
  type: "boolean";
  enum?: readonly boolean[];
  const?: boolean;
}

export interface NullValueSchemaSpec extends ValueSchemaAnnotations {
  type: "null";
  enum?: readonly null[];
  const?: null;
}

export interface ArrayValueSchemaSpec extends ValueSchemaAnnotations {
  type: "array";
  items?: ValueSchemaSpec;
}

export interface ObjectValueSchemaSpec extends ValueSchemaAnnotations {
  type: "object";
  properties?: ParameterSchemaSpec;
  additionalProperties?: boolean;
}

export interface JsonValueSchemaSpec extends ValueSchemaAnnotations {
  type: "json";
}

export interface OneOfValueSchemaSpec extends ValueSchemaAnnotations {
  oneOf: readonly [ValueSchemaSpec, ValueSchemaSpec, ...ValueSchemaSpec[]];
}

export type ValueSchemaSpec =
  | StringValueSchemaSpec
  | NumberValueSchemaSpec
  | IntegerValueSchemaSpec
  | BooleanValueSchemaSpec
  | NullValueSchemaSpec
  | ArrayValueSchemaSpec
  | ObjectValueSchemaSpec
  | JsonValueSchemaSpec
  | OneOfValueSchemaSpec;

export type ParameterPropertySpec = ValueSchemaSpec & { required?: boolean };

export type ParameterSchemaSpec = {
  [key: string]: ParameterPropertySpec;
  [key: symbol]: never;
};

export interface ParameterJsonSchema extends ObjectJsonSchema {
  properties: Record<string, JsonSchemaNode>;
}

type Simplify<T> = { [K in keyof T]: T[K] } & {};
type StringKeyOf<S> = Extract<keyof S, string>;
type RequiredKeys<S> = {
  [K in StringKeyOf<S>]: S[K] extends { required: true } ? K : never;
}[StringKeyOf<S>];

type InferProperty<P, Depth extends unknown[]> = InferValueAt<P, Depth>;

type InferProperties<S, Depth extends unknown[]> = Simplify<
  { [K in RequiredKeys<S>]: InferProperty<S[K], Depth> } & {
    [K in Exclude<StringKeyOf<S>, RequiredKeys<S>>]?: InferProperty<
      S[K],
      Depth
    >;
  }
>;

type InferObject<
  S extends { additionalProperties: boolean },
  Depth extends unknown[],
> = S extends { properties: infer P }
  ? S["additionalProperties"] extends true
    ? InferProperties<P, Depth> & Record<string, JsonValue>
    : InferProperties<P, Depth>
  : S["additionalProperties"] extends true
    ? Record<string, JsonValue>
    : Record<string, never>;

type InferScalar<S, Fallback> = S extends { const: infer C }
  ? C
  : S extends { enum: readonly (infer E)[] }
    ? E
    : Fallback;

type NextInferenceDepth<Depth extends unknown[]> = [unknown, ...Depth];

type InferValueAt<S, Depth extends unknown[]> = Depth["length"] extends 16
  ? JsonValue
  : S extends { type: "string" }
    ? InferScalar<S, string>
    : S extends { type: "number" | "integer" }
      ? InferScalar<S, number>
      : S extends { type: "boolean" }
        ? InferScalar<S, boolean>
        : S extends { type: "null" }
          ? null
          : S extends { type: "array" }
            ? S extends { items: infer I }
              ? InferValueAt<I, NextInferenceDepth<Depth>>[]
              : JsonValue[]
            : S extends { type: "object"; additionalProperties: boolean }
              ? InferObject<S, NextInferenceDepth<Depth>>
              : S extends { type: "json" }
                ? JsonValue
                : S extends { oneOf: readonly unknown[] }
                  ? InferValueAt<S["oneOf"][number], NextInferenceDepth<Depth>>
                  : never;

export type InferValue<S> = InferValueAt<S, []>;
export type InferArgs<S> = InferProperties<S, []>;

function copyAnnotations(
  source: Record<string, unknown>,
  target: JsonSchemaNode,
): void {
  if (Object.hasOwn(source, "description")) {
    target.description = source.description as string;
  }
  if (Object.hasOwn(source, "title")) {
    target.title = source.title as string;
  }
  if (Object.hasOwn(source, "default")) {
    target.default = source.default as JsonValue;
  }
  if (Object.hasOwn(source, "examples")) {
    target.examples = source.examples as JsonValue;
  }
}

export function valueSchemaSpecToJsonSchema(
  spec: ValueSchemaSpec,
): JsonSchemaNode {
  const node: JsonSchemaNode = {};
  copyAnnotations(spec as unknown as Record<string, unknown>, node);

  if ("oneOf" in spec) {
    node.oneOf = spec.oneOf.map(valueSchemaSpecToJsonSchema);
    return node;
  }

  if (spec.type === "json") {
    return node;
  }

  if (spec.type === "object") {
    node.type = "object";
    node.additionalProperties = spec.additionalProperties;
    if (spec.properties) {
      const propSchemas: Record<string, JsonSchemaNode> = {};
      const required: string[] = [];
      for (const [key, prop] of Object.entries(spec.properties)) {
        propSchemas[key] = valueSchemaSpecToJsonSchema(prop);
        if (prop.required === true) {
          required.push(key);
        }
      }
      node.properties = propSchemas;
      if (required.length > 0) {
        node.required = required;
      }
    }
    return node;
  }

  if (spec.type === "array") {
    node.type = "array";
    if (spec.items) {
      node.items = valueSchemaSpecToJsonSchema(spec.items);
    }
    return node;
  }

  node.type = spec.type;
  if ("enum" in spec && spec.enum) {
    node.enum = spec.enum as unknown as JsonSchemaScalar[];
  }
  if ("const" in spec && spec.const !== undefined) {
    node.const = spec.const as unknown as JsonSchemaScalar;
  }
  return node;
}

export function parameterSchemaSpecToJsonSchema(
  spec: ParameterSchemaSpec,
): ParameterJsonSchema {
  const properties: Record<string, JsonSchemaNode> = {};
  const required: string[] = [];

  for (const [key, prop] of Object.entries(spec)) {
    properties[key] = valueSchemaSpecToJsonSchema(prop);
    if (prop.required === true) {
      required.push(key);
    }
  }

  const result: ParameterJsonSchema = {
    type: "object",
    properties,
    additionalProperties: false,
  };

  if (required.length > 0) {
    result.required = required;
  }

  return result;
}

export function validateArgs(
  schema: JsonSchemaNode | Record<string, unknown>,
  args: unknown,
): string[] {
  return validateJsonSchemaValue(schema as JsonSchemaNode, args, "");
}

export interface DefineToolOptions<
  S extends ParameterSchemaSpec = ParameterSchemaSpec,
  O extends ValueSchemaSpec = ValueSchemaSpec,
> {
  readonly name: string;
  readonly description: string;
  readonly parameters: S;
  readonly output: {
    readonly schema: O;
    render(args: InferArgs<S>, value: InferValue<NoInfer<O>>): ContentBlock[];
    presentationMeta?(
      args: InferArgs<S>,
      value: InferValue<NoInfer<O>>,
    ): JsonValue;
  };
  readonly deferLoading?: true;
  readonly timeoutMs?: number;
  readonly prerequisiteSkill?: string | string[];
  execute(
    args: InferArgs<S>,
    exec: ToolRunContext,
  ): Promise<InferValue<NoInfer<O>>>;
  presentResult?(
    args: InferArgs<S>,
    result: ToolResult,
  ): ToolResultView | undefined;
  isConcurrencySafe?(args: InferArgs<S>): boolean;
  presentCall?(args: InferArgs<S>): ToolCallView | undefined;
}

export function defineTool<
  const S extends ParameterSchemaSpec,
  const O extends ValueSchemaSpec,
>(options: DefineToolOptions<S, O>): ToolDefinition {
  const userExecute = options.execute;
  const userRender = options.output.render;
  const userPresentationMeta = options.output.presentationMeta;
  const userPresentCall = options.presentCall;
  const userPresentResult = options.presentResult;
  const userIsConcurrencySafe = options.isConcurrencySafe;

  if (
    options.timeoutMs !== undefined &&
    (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)
  ) {
    throw new Error(
      `defineTool(${options.name}): timeoutMs must be a positive finite number`,
    );
  }

  const parameters = parameterSchemaSpecToJsonSchema(options.parameters);
  const outputSchema = valueSchemaSpecToJsonSchema(options.output.schema);

  const validate = (args: unknown): string[] =>
    validateJsonSchemaValue(parameters, args, "");

  const tool: ToolDefinition = {
    type: "function",
    name: options.name,
    description: options.description,
    parameters: parameters as unknown as Record<string, unknown>,
    output: {
      schema: outputSchema,
      render(args: unknown, value: JsonValue): ContentBlock[] {
        return userRender(
          args as InferArgs<S>,
          value as InferValue<NoInfer<O>>,
        );
      },
      ...(userPresentationMeta !== undefined
        ? {
            presentationMeta(args: unknown, value: JsonValue): JsonValue {
              return userPresentationMeta(
                args as InferArgs<S>,
                value as InferValue<NoInfer<O>>,
              );
            },
          }
        : {}),
    },
    ...(options.deferLoading === true ? { deferLoading: true } : {}),
    ...(options.timeoutMs !== undefined
      ? { timeoutMs: options.timeoutMs }
      : {}),
    ...(options.prerequisiteSkill !== undefined
      ? { prerequisiteSkill: options.prerequisiteSkill }
      : {}),
    async execute(args: unknown, exec: ToolRunContext): Promise<JsonValue> {
      const violations = validate(args);
      if (violations.length > 0) throw new ToolArgsError(violations);
      return userExecute(args as InferArgs<S>, exec) as Promise<JsonValue>;
    },
  };

  if (userPresentCall) {
    tool.presentCall = (args: unknown): ToolCallView | undefined => {
      if (validate(args).length > 0) return undefined;
      return userPresentCall(args as InferArgs<S>);
    };
  }

  if (userPresentResult) {
    tool.presentResult = (
      args: unknown,
      result: ToolResult,
    ): ToolResultView | undefined => {
      if (validate(args).length > 0) return undefined;
      return userPresentResult(args as InferArgs<S>, result);
    };
  }

  if (userIsConcurrencySafe) {
    tool.isConcurrencySafe = (args: unknown): boolean => {
      if (validate(args).length > 0) return false;
      return userIsConcurrencySafe(args as InferArgs<S>);
    };
  }

  return tool;
}
