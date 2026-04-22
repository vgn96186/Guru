import { z } from 'zod';
import { zodToJsonSchema } from './tool';
import type { ToolDescription } from './spec';

export function schemaAsEmitTool<T>(
  schema: z.ZodType<T>,
  name: string = 'emit_result',
  description: string = 'Return the final structured answer.',
): ToolDescription[] {
  return [
    {
      name,
      description,
      inputSchema: zodToJsonSchema(schema),
    },
  ];
}
