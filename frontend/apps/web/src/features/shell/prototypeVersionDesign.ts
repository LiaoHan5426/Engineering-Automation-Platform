import { canAutoDeliver, parsePrototypeSchema, type PrototypeSchema } from './prototypeSchema';

/** One decoder for persisted design versions, shared by Builder and task/Run previews. */
export function prototypeVersionDesign(body: string): { semantic: boolean; schema: PrototypeSchema | null; blocked: boolean } {
  try {
    const data = JSON.parse(body);
    if (typeof data?.format !== 'string' || !data.format.startsWith('eap-prototype-')) return { semantic: false, schema: null, blocked: false };
    const schema = data.format === 'eap-prototype-v1' ? parsePrototypeSchema(JSON.stringify(data.schema)) : null;
    return { semantic: true, schema, blocked: !schema || !canAutoDeliver(schema) };
  } catch {
    const semantic = body.includes('eap-prototype-');
    return { semantic, schema: null, blocked: semantic };
  }
}
