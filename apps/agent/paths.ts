import path from "node:path";

export function resolveInside(root: string, filePath: string, posix = false): string {
  if (filePath.includes("\0")) throw new Error("invalid path");
  const lib = posix ? path.posix : path;
  const resolved = lib.resolve(root, filePath);
  const relative = lib.relative(root, resolved);
  if (relative.startsWith("..") || lib.isAbsolute(relative)) {
    throw new Error(`path escapes the repository: ${filePath}`);
  }
  return resolved;
}
