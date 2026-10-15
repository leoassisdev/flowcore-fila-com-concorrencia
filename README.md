# Fila com Limite de Concorrência

> Processa milhares de itens com N tarefas por vez, resultados na ordem, timeout por tarefa e progresso. Importação e envio em massa sem estourar rate limit nem memória.

**Ver ao vivo, com preview e manual:** https://flowcoresolucoes.com.br/codigos/fila-com-concorrencia

Criado por **FlowCore Soluções LTDA**.

## Arquivos

- [`src/fila-concorrencia.ts`](src/fila-concorrencia.ts)
- [`src/fila-concorrencia.test.ts`](src/fila-concorrencia.test.ts)

## Como instalar

1. **Funciona onde você já roda** Node 18+, Cloudflare Workers, Deno, Bun, Vercel e Netlify Functions. Zero dependência: só fetch e Web Crypto, que já vêm no runtime.
2. **Crie src/lib/fila-concorrencia.ts** Copie o conteúdo de `src/fila-concorrencia.ts` e `src/fila-concorrencia.test.ts` deste repositório.
3. **Use**

   ```bash
   const resultados = await executarComLimite(clientes, (c, _i, signal) => sincronizarNoCrm(c, signal), {
     concorrencia: 5,
     timeoutMs: 10_000,
     aoProgredir: (p) => console.log(`${p.concluidas}/${p.total}`),
   });
   ```

4. **Rode o teste junto** O arquivo de teste (`src/fila-concorrencia.test.ts`) cobre 8 cenários. Copie para src/lib/ ao lado e rode:

   ```bash
   npm install -D vitest
   npx vitest run src/lib
   ```


## Testes

`src/fila-concorrencia.test.ts` cobre 8 cenários.

```bash
npm install
npm test
```

## Licença

MIT. Pode usar em projeto pessoal ou comercial, de graça. A única condição é manter a linha **“Criado por FlowCore Soluções LTDA”** (ou o crédito de adaptação) onde ela está.

---

Precisa disso integrado no seu sistema? A [FlowCore](https://flowcoresolucoes.com.br) desenvolve sob medida.
