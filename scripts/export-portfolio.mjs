import { access, cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const appDirectory = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(scriptDirectory, "../../..");
const portfolioRoot = resolve(repositoryRoot, "portfolio");
const target = resolve(portfolioRoot, "bpmn-generator");
const dist = resolve(appDirectory, "dist");

if (dirname(target) !== portfolioRoot || target !== resolve(repositoryRoot, "portfolio/bpmn-generator")) {
  throw new Error("公開先が想定外です。書き出しを中止しました。");
}

await access(resolve(dist, "index.html"));
await access(resolve(dist, "assets"));
await mkdir(portfolioRoot, { recursive: true });
await rm(target, { recursive: true, force: true });
await cp(dist, target, { recursive: true });

console.log(`公開用ファイルを書き出しました: ${target}`);
