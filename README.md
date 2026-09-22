# Fila de Carregamento

Sistema web responsivo e otimizado para celular para organização da fila de caminhoneiros em carregamento.

## Visão geral

Este projeto foi estruturado como uma aplicação web/PWA com foco em mobile, pronta para evoluir para app Android no futuro. A ideia principal é permitir que o motorista entre em uma fila virtual, acompanhe sua posição em tempo real, receba avisos quando estiver próximo do atendimento e permita que o administrador controle a fila de forma simples e segura.

## Stack

- React + TypeScript
- Vite
- Tailwind CSS
- Supabase
- Supabase Auth
- Supabase Realtime
- PWA
- Vitest

## Estrutura do projeto

```text
fila-carregamento/
├── public/
│   ├── manifest.webmanifest
│   ├── service-worker.js
│   └── queue-icon.svg
├── src/
│   ├── App.tsx
│   ├── App.css
│   ├── index.css
│   ├── main.tsx
│   ├── queueLogic.test.ts
│   └── setupTests.ts
├── supabase/
│   └── schema.sql
├── .env.example
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

## Requisitos

- Node.js 20+
- npm
- Conta no Supabase

## Instalação

```bash
npm install
cp .env.example .env
```

Preencha as variáveis no arquivo `.env`.

## Scripts

```bash
npm run dev
npm run build
npm run test
npm run preview
```

## Configuração do Supabase

1. Crie um projeto no Supabase.
2. Abra o SQL Editor e execute o conteúdo de `supabase/schema.sql`.
3. Copie a URL do projeto e as chaves de API para o arquivo `.env` na raiz do projeto.
4. Ative a autenticação no painel do Supabase.
5. Ative o Realtime para a tabela `queue_entries`.
6. Configure os usuários administrativos e a política final de segurança em produção.

### Variáveis de ambiente

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon
```

> Nunca coloque a chave `service_role` em variáveis `VITE_` ou no frontend. Ela deve ficar exclusivamente em um backend confiável.

## Publicação gratuita

### Frontend

- Publique no Vercel ou Netlify.
- Conecte o GitHub.
- Configure as variáveis de ambiente.
- Use HTTPS e domínio gratuito.

### Backend e banco

- Use o Supabase em plano gratuito.
- Recomendado para primeira fase.
- Limites: armazenamento, banda, usuários e número de projetos devem ser revisados conforme o uso real.

## Funcionalidades

- Entrada na fila pelo celular
- Código único de acesso do motorista
- Visualização de posição em tempo real
- Painel administrativo
- Histórico de carregamentos
- PWA instalável
- QR Code
- Estrutura pronta para múltiplas filas e unidades

## Observação

Esta é a base funcional e estrutural do sistema. Para a versão completa com Supabase real, autenticação e tempo real, é necessário conectar o projeto à conta do Supabase e implementar as políticas de segurança e as funções de fila em SQL.
