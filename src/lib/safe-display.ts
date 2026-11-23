const CONNECTION = /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis(?:s)?|amqp|amqps):\/\/\S+/gi;

export function maskForDisplay(value: string, setting?: string) {
  const found = value.match(new RegExp(CONNECTION.source, "gi"));
  if (!found) return { text: value, warning: null as string | null };
  const warning = `This setting looks like a database address, check the ${setting || "matching"} setting in Vercel`;
  const text = value.replace(new RegExp(CONNECTION.source, "gi"), "").replace(/\s{2,}/g, " ").trim();
  return { text, warning };
}
