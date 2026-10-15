// fila-concorrencia.test.ts · Criado por FlowCore Soluções LTDA · flowcoresolucoes.com.br/codigos · licença MIT
import { describe, expect, it } from "vitest";
import { ErroTimeoutTarefa, executarComLimite, mapearComLimite, type Progresso } from "./fila-concorrencia";

const esperar = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(signal.reason);
    });
  });

describe("fila-concorrencia", () => {
  it("mantém a ordem dos resultados mesmo terminando fora de ordem", async () => {
    const r = await mapearComLimite([30, 5, 20, 1], async (ms, i) => {
      await esperar(ms);
      return `item${i}`;
    });
    expect(r).toEqual(["item0", "item1", "item2", "item3"]);
  });

  it("nunca passa do limite de concorrência", async () => {
    let ativas = 0;
    let pico = 0;
    await executarComLimite(Array.from({ length: 20 }, (_, i) => i), async () => {
      pico = Math.max(pico, ++ativas);
      await esperar(2);
      ativas--;
    }, { concorrencia: 3 });
    expect(pico).toBe(3);
  });

  it("coleta erros sem parar a fila por padrão", async () => {
    const r = await executarComLimite([1, 2, 3, 4], async (n) => {
      if (n % 2 === 0) throw new Error(`falhou ${n}`);
      return n * 10;
    }, { concorrencia: 2 });
    expect(r[0]).toEqual({ ok: true, valor: 10 });
    expect(r[1]).toMatchObject({ ok: false, erro: { message: "falhou 2" } });
    expect(r[2]).toEqual({ ok: true, valor: 30 });
    expect(r.filter((x) => !x.ok)).toHaveLength(2);
  });

  it("para no primeiro erro, cancela as em andamento e não inicia novas", async () => {
    const iniciadas: number[] = [];
    let canceladas = 0;
    const promessa = executarComLimite(Array.from({ length: 10 }, (_, i) => i), async (n, _i, signal) => {
      iniciadas.push(n);
      if (n === 1) throw new Error("erro fatal");
      await esperar(50, signal).catch((e) => {
        canceladas++;
        throw e;
      });
      return n;
    }, { concorrencia: 2, pararNoPrimeiroErro: true });
    await expect(promessa).rejects.toThrow("erro fatal");
    expect(iniciadas).toEqual([0, 1]);
    expect(canceladas).toBe(1);
  });

  it("aplica timeout por tarefa e aborta o signal dela", async () => {
    let abortou = false;
    const r = await executarComLimite([100, 1], async (ms, _i, signal) => {
      signal.addEventListener("abort", () => (abortou = true));
      await esperar(ms);
      return ms;
    }, { timeoutMs: 20 });
    expect(r[0].ok).toBe(false);
    expect((r[0] as { erro: unknown }).erro).toBeInstanceOf(ErroTimeoutTarefa);
    expect(r[1]).toEqual({ ok: true, valor: 1 });
    expect(abortou).toBe(true);
  });

  it("informa o progresso a cada tarefa concluída", async () => {
    const eventos: Progresso[] = [];
    await executarComLimite([1, 2, 3], async (n) => {
      if (n === 2) throw new Error("x");
      return n;
    }, { concorrencia: 1, aoProgredir: (p) => eventos.push(p) });
    expect(eventos).toEqual([
      { concluidas: 1, total: 3, sucessos: 1, erros: 0 },
      { concluidas: 2, total: 3, sucessos: 1, erros: 1 },
      { concluidas: 3, total: 3, sucessos: 2, erros: 1 },
    ]);
  });

  it("cancela a fila inteira por AbortSignal externo", async () => {
    const ctrl = new AbortController();
    const promessa = executarComLimite([1, 2, 3, 4, 5], async (_n, i, signal) => {
      if (i === 1) ctrl.abort();
      await esperar(10, signal);
    }, { concorrencia: 2, signal: ctrl.signal });
    await expect(promessa).rejects.toBeTruthy();
    const jaCancelado = new AbortController();
    jaCancelado.abort();
    await expect(executarComLimite([1], async () => 1, { signal: jaCancelado.signal })).rejects.toBeTruthy();
  });

  it("lista vazia e validação de opções", async () => {
    expect(await executarComLimite([], async () => 1)).toEqual([]);
    await expect(executarComLimite([1], async () => 1, { concorrencia: 0 })).rejects.toThrow("concorrencia");
    await expect(executarComLimite([1], async () => 1, { timeoutMs: -1 })).rejects.toThrow("timeoutMs");
  });
});
