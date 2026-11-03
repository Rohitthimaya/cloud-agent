export type EditResult = { ok: true; content: string } | { ok: false; error: string };

export function applyEdit(content: string, oldString: string, newString: string): EditResult {
  if (oldString === "") return { ok: false, error: "old_string must not be empty" };
  if (oldString === newString) return { ok: false, error: "old_string and new_string are identical" };

  const first = content.indexOf(oldString);
  if (first === -1) return { ok: false, error: "old_string was not found in the file" };

  const second = content.indexOf(oldString, first + oldString.length);
  if (second !== -1) {
    return { ok: false, error: "old_string matched more than once; include more surrounding context" };
  }

  return {
    ok: true,
    content: content.slice(0, first) + newString + content.slice(first + oldString.length),
  };
}
