import {
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

/** Valida `sections` como `string[][]` (paths no vacíos). */
export function IsSectionPaths(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSectionPaths',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (!Array.isArray(value)) return false;
          return value.every(
            (path) =>
              Array.isArray(path) &&
              path.length > 0 &&
              path.every(
                (seg) => typeof seg === 'string' && seg.trim().length > 0,
              ),
          );
        },
        defaultMessage() {
          return 'sections must be an array of non-empty string paths (string[][])';
        },
      },
    });
  };
}

export function normalizeSections(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((path): path is unknown[] => Array.isArray(path))
    .map((path) =>
      path
        .filter((seg): seg is string => typeof seg === 'string')
        .map((seg) => seg.trim())
        .filter(Boolean),
    )
    .filter((path) => path.length > 0);
}
