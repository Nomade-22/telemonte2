# Telemonte — Gestão de Coleta de Resíduos

Versão estática preparada para publicação em:

`https://nomade-22.github.io/Telemonte/`

## Publicação

1. Apague os arquivos antigos do repositório ou substitua todo o conteúdo pelos arquivos deste pacote.
2. Confirme que a pasta `.github/workflows` também foi enviada.
3. No GitHub, abra **Settings → Pages**.
4. Em **Build and deployment → Source**, selecione **GitHub Actions**.
5. Abra a aba **Actions** e aguarde a execução "Publicar no GitHub Pages" ficar verde.

Sempre que houver uma alteração na branch `main`, o site será recompilado e publicado automaticamente.

## Desenvolvimento local

```bash
npm install
npm run dev
```

Os dados atuais são demonstrativos. Banco de dados, autenticação, GPS, fotos e assinaturas precisam de serviços externos para funcionamento real.
