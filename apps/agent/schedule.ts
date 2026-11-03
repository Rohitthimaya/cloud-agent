export function groupToolCalls<T>(calls: readonly T[], isReadOnly: (call: T) => boolean): T[][] {
  const groups: T[][] = [];
  for (const call of calls) {
    const last = groups.at(-1);
    if (last && isReadOnly(call) && last[0] !== undefined && isReadOnly(last[0])) {
      last.push(call);
    } else {
      groups.push([call]);
    }
  }
  return groups;
}
