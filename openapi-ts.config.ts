import fs from 'node:fs';
import path from 'node:path';

import { defineConfig } from '@hey-api/openapi-ts';

type OpenApiSchema = {
  $ref?: string;
  additionalProperties?: boolean | OpenApiSchema;
  allOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  items?: OpenApiSchema | OpenApiSchema[];
  oneOf?: OpenApiSchema[];
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  type?: string;
  [key: string]: unknown;
};

type OpenApiMediaTypeObject = {
  schema?: OpenApiSchema;
  [key: string]: unknown;
};

type OpenApiRequestBodyObject = {
  content?: Record<string, OpenApiMediaTypeObject>;
  [key: string]: unknown;
};

type OpenApiParameterObject = {
  in?: string;
  name?: string;
  required?: boolean;
  schema?: OpenApiSchema;
  [key: string]: unknown;
};

type OpenApiParameterRef = {
  $ref: string;
  [key: string]: unknown;
};

type OpenApiParameter = OpenApiParameterObject | OpenApiParameterRef;

type OpenApiOperationObject = {
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBodyObject;
  [key: string]: unknown;
};

type OpenApiPathItemObject = {
  patch?: OpenApiOperationObject;
  parameters?: OpenApiParameter[];
  [key: string]: unknown;
};

type OpenApiDocument = {
  components?: {
    schemas?: Record<string, OpenApiSchema>;
  };
  definitions?: Record<string, OpenApiSchema>;
  parameters?: Record<string, OpenApiParameterObject>;
  paths?: Record<string, OpenApiPathItemObject>;
};

type MutableMediaTypeObject = Record<string, unknown> & {
  schema?: OpenApiSchema;
};

type MutableRequestBodyObject = Record<string, unknown> & {
  content?: Record<string, unknown>;
};

type MutableOperationObject = Record<string, unknown> & {
  parameters?: Array<unknown>;
  requestBody?: MutableRequestBodyObject;
};

type PatchOperations = Record<string, (operation: unknown) => void>;

const OPENAPI_INPUT = path.resolve(
  process.cwd(),
  '__generated__/supabase/openapi.json',
);
const shouldDebugPatch = process.env.OPENAPI_PATCH_DEBUG === 'true';

const deepClone = <T>(value: T): T => {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
};

const buildPatchOperations = (): PatchOperations | undefined => {
  if (!fs.existsSync(OPENAPI_INPUT)) {
    return undefined;
  }

  try {
    const document = JSON.parse(
      fs.readFileSync(OPENAPI_INPUT, 'utf8'),
    ) as OpenApiDocument;

    if (!document.paths) {
      return undefined;
    }

    const componentSchemas = document.components?.schemas ?? {};
    const definitionSchemas = document.definitions ?? {};
    const parameterRegistry = document.parameters ?? {};

    const resolveSchema = (ref: string): OpenApiSchema | undefined => {
      if (ref.startsWith('#/components/schemas/')) {
        const schemaKey = ref.replace('#/components/schemas/', '');

        return componentSchemas[schemaKey];
      }

      if (ref.startsWith('#/definitions/')) {
        const schemaKey = ref.replace('#/definitions/', '');

        return definitionSchemas[schemaKey];
      }

      return undefined;
    };

    const resolveParameter = (
      ref: string,
    ): OpenApiParameterObject | undefined => {
      if (!ref.startsWith('#/parameters/')) {
        return undefined;
      }

      const parameterKey = ref.replace('#/parameters/', '');

      return parameterRegistry[parameterKey];
    };

    const isReferenceObject = (value: unknown): value is { $ref: string } => {
      if (!value || typeof value !== 'object') {
        return false;
      }

      return typeof (value as { $ref?: unknown }).$ref === 'string';
    };

    const isRecord = (value: unknown): value is Record<string, unknown> => {
      return typeof value === 'object' && value !== null;
    };

    const isSchemaObject = (value: unknown): value is OpenApiSchema => {
      return isRecord(value);
    };

    const isMediaTypeObject = (value: unknown): value is MutableMediaTypeObject => {
      return isRecord(value);
    };

    const isParameterObject = (value: unknown): value is OpenApiParameterObject => {
      if (!isRecord(value)) {
        return false;
      }

      return typeof (value as { in?: unknown }).in === 'string';
    };

    const isBodyParameterObject = (
      value: OpenApiParameterObject,
    ): value is OpenApiParameterObject & { schema: OpenApiSchema } => {
      if (value.in !== 'body') {
        return false;
      }

      if (!('schema' in value)) {
        return false;
      }

      return isSchemaObject(value.schema);
    };

    const makePartialSchema = (
      schema: OpenApiSchema,
      seenRefs: Set<string> = new Set(),
    ): OpenApiSchema => {
      const cloned = deepClone(schema);

      if (typeof cloned.$ref === 'string') {
        const { $ref, ...rest } = cloned;

        if (seenRefs.has($ref)) {
          return rest;
        }

        const resolved = resolveSchema($ref);

        if (!resolved) {
          return rest;
        }

        const merged = makePartialSchema(resolved, new Set(seenRefs).add($ref));

        return { ...merged, ...rest };
      }

      if (cloned.properties) {
        const partialProperties = Object.entries(cloned.properties).map(
          ([key, value]) => [key, makePartialSchema(value, new Set(seenRefs))],
        );
        cloned.properties = Object.fromEntries(partialProperties);
      }

      if (Array.isArray(cloned.items)) {
        cloned.items = cloned.items.map((item) =>
          makePartialSchema(item, new Set(seenRefs)),
        );
      } else if (cloned.items) {
        cloned.items = makePartialSchema(cloned.items, new Set(seenRefs));
      }

      if (Array.isArray(cloned.allOf)) {
        cloned.allOf = cloned.allOf.map((item) =>
          makePartialSchema(item, new Set(seenRefs)),
        );
      }

      if (Array.isArray(cloned.anyOf)) {
        cloned.anyOf = cloned.anyOf.map((item) =>
          makePartialSchema(item, new Set(seenRefs)),
        );
      }

      if (Array.isArray(cloned.oneOf)) {
        cloned.oneOf = cloned.oneOf.map((item) =>
          makePartialSchema(item, new Set(seenRefs)),
        );
      }

      if (
        cloned.additionalProperties &&
        typeof cloned.additionalProperties === 'object' &&
        !Array.isArray(cloned.additionalProperties)
      ) {
        cloned.additionalProperties = makePartialSchema(
          cloned.additionalProperties as OpenApiSchema,
          new Set(seenRefs),
        );
      }

      if (cloned.required) {
        delete cloned.required;
      }

      return cloned;
    };

    const operations: PatchOperations = {};

    Object.entries(document.paths).forEach(([pathKey, pathItem]) => {
      const patchOperation = pathItem?.patch;

      if (!patchOperation) {
        return;
      }

      const pathLevelParameters = Array.isArray(pathItem?.parameters)
        ? pathItem.parameters
        : [];
      const operationLevelParameters = Array.isArray(patchOperation.parameters)
        ? patchOperation.parameters
        : [];

      const hasRequestBody =
        isRecord(patchOperation.requestBody) &&
        isRecord(
          (patchOperation.requestBody as MutableRequestBodyObject).content,
        );

      const hasBodyParameter = [...pathLevelParameters, ...operationLevelParameters].some(
        (parameter) => {
          if (isReferenceObject(parameter)) {
            const resolved = resolveParameter(parameter.$ref);

            return resolved ? isBodyParameterObject(resolved) : false;
          }

          if (!isParameterObject(parameter)) {
            return false;
          }

          return isBodyParameterObject(parameter);
        },
      );

      if (!hasRequestBody && !hasBodyParameter) {
        return;
      }

      const operationKey = `PATCH ${pathKey}`;

      operations[operationKey] = (operation) => {
        if (!isRecord(operation)) {
          if (shouldDebugPatch) {
            console.info(
              `[openapi-ts] skipped PATCH transform for ${operationKey} due to unexpected shape`,
            );
          }

          return;
        }

        const mutableOperation = operation as MutableOperationObject;
        const mutableRequestBody = mutableOperation.requestBody;

        if (
          isRecord(mutableRequestBody) &&
          isRecord(mutableRequestBody.content)
        ) {
          Object.values(mutableRequestBody.content).forEach((mediaType) => {
            if (
              !isMediaTypeObject(mediaType) ||
              !isSchemaObject(mediaType.schema)
            ) {
              return;
            }

            mediaType.schema = makePartialSchema(mediaType.schema);

            if (shouldDebugPatch) {
              console.info(
                `[openapi-ts] made PATCH body partial for ${operationKey}`,
              );
            }
          });
        }

        if (!Array.isArray(mutableOperation.parameters)) {
          if (shouldDebugPatch) {
            console.info(
              `[openapi-ts] no parameters array for ${operationKey}`,
            );
          }

          return;
        }

        const normalizedParameters = mutableOperation.parameters.map((parameter) => {
          if (isReferenceObject(parameter)) {
            const resolved = resolveParameter(parameter.$ref);

            if (!resolved || !isBodyParameterObject(resolved)) {
              return parameter;
            }

            const clonedParameter = deepClone(resolved);
            clonedParameter.schema = makePartialSchema(resolved.schema);

            if (shouldDebugPatch) {
              console.info(
                `[openapi-ts] converted reference body parameter for ${operationKey}`,
              );
            }

            return clonedParameter;
          }

          if (!isParameterObject(parameter)) {
            return parameter;
          }

          if (!isBodyParameterObject(parameter)) {
            return parameter;
          }

          const clonedParameter = deepClone(parameter);
          clonedParameter.schema = makePartialSchema(parameter.schema);

          if (shouldDebugPatch) {
            console.info(
              `[openapi-ts] converted inline body parameter for ${operationKey}`,
            );
          }

          return clonedParameter;
        });

        mutableOperation.parameters = normalizedParameters;
      };
    });

    if (shouldDebugPatch) {
      console.info(
        '[openapi-ts] prepared PATCH operations:',
        Object.keys(operations),
      );
    }

    return Object.keys(operations).length > 0 ? operations : undefined;
  } catch (error) {
    console.warn(
      '[openapi-ts] failed to prepare PATCH body transformer',
      error,
    );

    return undefined;
  }
};

const patchOperations = buildPatchOperations();

export default defineConfig({
  input: './__generated__/supabase/openapi.json',
  output: './__generated__/supabase',
  parser: {
    validate_EXPERIMENTAL: true,
    ...(patchOperations ? { patch: { operations: patchOperations } } : {}),
    // filters: { operations: { include: [/^\/escape_from_seoul_/] } }
  },
  plugins: [
    '@hey-api/client-next',
    'zod',
    {
      name: '@hey-api/sdk',
      validator: 'zod',
    },
  ],
});
