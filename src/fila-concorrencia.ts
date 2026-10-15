// fila-concorrencia.ts · Criado por FlowCore Soluções LTDA · flowcoresolucoes.com.br/codigos · licença MIT
// Processa listas grandes (importação, envio em massa, sincronização com
// ERP/CRM) com limite de tarefas simultâneas, sem estourar rate limit nem
// memória: resultados na mesma ordem da entrada, timeout por tarefa (com
// AbortSignal pra cancelar o fetch), callback de progresso e opção de parar
// tudo no primeiro erro.
// Roda em Node 18+, Cloudflare Workers, Deno, Bun e no navegador.
// Zero dependências.
//
// Referência: padrão "worker pool" sobre Promises (ECMAScript 2020,
// Promise.allSettled) e DOM Standard (AbortController/AbortSignal).

export const CRIADO_POR = "Criado por FlowCore Soluções LTDA";

export type ResultadoTarefa<R> = { ok: true; valor: R } | { ok: false; erro: unknown };

export type Progresso = { concluidas: number; total: number; sucessos: number; erros: number };

export type OpcoesFila = {
  /** Tarefas ao mesmo tempo. Padrão 5. */
  concorrencia?: number;
  /** Tempo máximo de cada tarefa, em ms. Sem padrão (sem limite). */
  timeoutMs?: number;
  /** Se true, cancela as demais e rejeita com o primeiro erro. Padrão false. */
  pararNoPrimeiroErro?: boolean;
  aoProgredir?: (p: Progresso) => void;
  /** Cancela a fila inteira. */
  signal?: AbortSignal;
};

export class ErroTimeoutTarefa extends Error {
  constructor(
    readonly indice: number,
    readonly timeoutMs: number,
  ) {
    super(`Tarefa ${indice} excedeu ${timeoutMs} ms`);
    this.name = "ErroTimeoutTarefa";
  }
}

function erroCancelado(signal?: AbortSignal): Error {
  if (signal?.reason instanceof Error) return signal.reason;
  const e = new Error("Fila cancelada");
  e.name = "AbortError";
  return e;
}

/**
 * Executa `tarefa` pra cada item com limite de concorrência.
 * Retorna um resultado por item, na ordem original (ok/erro), sem lançar,
 * a menos que `pararNoPrimeiroErro` esteja ligado ou a fila seja cancelada.
 */
export async function executarComLimite<T, R>(
  itens: readonly T[],
  tarefa: (item: T, indice: number, signal: AbortSignal) => Promise<R>,
  opcoes: OpcoesFila = {},
): Promise<ResultadoTarefa<R>[]> {
  const concorrencia = opcoes.concorrencia ?? 5;
  if (!Number.isInteger(concorrencia) || concorrencia < 1) throw new Error("concorrencia precisa ser inteiro maior que zero");
  if (opcoes.timeoutMs !== undefined && !(opcoes.timeoutMs > 0)) throw new Error("timeoutMs precisa ser maior que zero");
  if (opcoes.signal?.aborted) throw erroCancelado(opcoes.signal);

  const total = itens.length;
  const resultados: ResultadoTarefa<R>[] = new Array(total);
  const geral = new AbortController();
  const aoCancelarExterno = () => geral.abort(opcoes.signal?.reason);
  opcoes.signal?.addEventListener("abort", aoCancelarExterno, { once: true });

  let proximo = 0;
  let concluidas = 0;
  let sucessos = 0;
  let erros = 0;
  let primeiroErro: { erro: unknown } | null = null;

  const rodarUma = (indice: number): Promise<R> => {
    const ctrl = new AbortController();
    const repassar = () => ctrl.abort(geral.signal.reason);
    geral.signal.addEventListener("abort", repassar, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const execucao = Promise.resolve().then(() => tarefa(itens[indice], indice, ctrl.signal));
    const corrida =
      opcoes.timeoutMs === undefined
        ? execucao
        : Promise.race([
            execucao,
            new Promise<never>((_, rej) => {
              timer = setTimeout(() => {
                const e = new ErroTimeoutTarefa(indice, opcoes.timeoutMs as number);
                ctrl.abort(e);
                rej(e);
              }, opcoes.timeoutMs);
            }),
          ]);
    return corrida.finally(() => {
      clearTimeout(timer);
      geral.signal.removeEventListener("abort", repassar);
    });
  };

  const trabalhador = async () => {
    while (proximo < total && !geral.signal.aborted) {
      const i = proximo++;
      try {
        resultados[i] = { ok: true, valor: await rodarUma(i) };
        sucessos++;
      } catch (erro) {
        resultados[i] = { ok: false, erro };
        erros++;
        if (opcoes.pararNoPrimeiroErro && !primeiroErro) {
          primeiroErro = { erro };
          geral.abort(erro);
        }
      }
      concluidas++;
      opcoes.aoProgredir?.({ concluidas, total, sucessos, erros });
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(concorrencia, total) }, trabalhador));
  } finally {
    opcoes.signal?.removeEventListener("abort", aoCancelarExterno);
  }

  if (primeiroErro) throw (primeiroErro as { erro: unknown }).erro;
  if (opcoes.signal?.aborted) throw erroCancelado(opcoes.signal);
  return resultados;
}

/** Igual a executarComLimite, mas devolve só os valores e lança no primeiro erro. */
export async function mapearComLimite<T, R>(
  itens: readonly T[],
  tarefa: (item: T, indice: number, signal: AbortSignal) => Promise<R>,
  opcoes: Omit<OpcoesFila, "pararNoPrimeiroErro"> = {},
): Promise<R[]> {
  const r = await executarComLimite(itens, tarefa, { ...opcoes, pararNoPrimeiroErro: true });
  return r.map((x) => (x as { ok: true; valor: R }).valor);
}
