export const parseMarkdown = (
  markdown: string,
  variable: Record<string, unknown>,
): string => {
  for (const [key, value] of Object.entries(variable)) {
    markdown = markdown.replaceAll(`{{${key}}}`, JSON.stringify(value));
  }

  return markdown;
};
