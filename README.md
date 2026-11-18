# BrDias Lanches

Aplicativo de pedidos para lanchonete.

## Tecnologias

- HTML
- CSS
- JavaScript modular
- Firebase Authentication
- Cloud Firestore
- Firebase Storage
- GitHub Pages

## Arquivos

- index.html: estrutura do aplicativo.
- style.css: aparência e responsividade.
- firebase.js: conexão com Firebase.
- app.js: login, cadastro, cardápio, carrinho e pedidos.
- firestore.rules: regras de segurança do banco.
- storage.rules: regras de segurança das fotos.
- manifest.json: informações de instalação do aplicativo.

## Configuração

1. Ative Email/Senha em Firebase Authentication.
2. Crie o banco Cloud Firestore.
3. Ative Firebase Storage.
4. Publique firestore.rules no Firestore.
5. Publique storage.rules no Storage.
6. Envie os arquivos para o GitHub.
7. Ative GitHub Pages na branch principal.

## Primeiro proprietário

1. Crie uma conta pelo próprio aplicativo.
2. Entre no Firebase Console.
3. Abra Firestore Database.
4. Abra a coleção profiles.
5. Entre no documento com o UID da sua conta.
6. Altere o campo role de customer para owner.

Não permita que usuários comuns alterem esse campo.

## Motoboy

1. O motoboy cria uma conta pelo aplicativo.
2. O proprietário copia o UID da conta em Authentication.
3. O proprietário cola o UID no painel.
4. O sistema altera o perfil para courier.
5. O proprietário pode atribuir pedidos ao motoboy.

## Publicação

No GitHub:
Settings > Pages > Deploy from a branch > main > / (root).

O aplicativo utiliza Firebase como backend. GitHub Pages hospeda apenas os arquivos do site.
