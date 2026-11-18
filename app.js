import { auth, db, storage } from "./firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  collection,
  addDoc,
  getDoc,
  setDoc,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

/* ELEMENTOS E ESTADO */

const $ = id => document.getElementById(id);

let usuarioAtual = null;
let perfilAtual = null;
let produtos = [];
let pedidos = [];
let carrinho = [];
let pararProdutos = null;
let pararPedidos = null;
let enviandoPedido = false;

const STATUS = {
  pending: "Aguardando confirmação",
  accepted: "Pedido aceito",
  preparing: "Em preparação",
  ready: "Pronto para retirada",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  cancelled: "Cancelado"
};

const dinheiro = valor =>
  Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

function escapar(valor = "") {
  return String(valor).replace(/[&<>"']/g, caractere => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[caractere]);
}

function notificar(mensagem) {
  const caixa = $("notificacao");
  caixa.textContent = mensagem;
  caixa.classList.add("visivel");
  setTimeout(() => caixa.classList.remove("visivel"), 3200);
}

function mensagem(id, texto, erro = false) {
  const elemento = $(id);
  if (!elemento) return;
  elemento.textContent = texto;
  elemento.classList.toggle("erro", erro);
}

function mostrar(id, visivel) {
  $(id).classList.toggle("oculto", !visivel);
}

function formatarData(timestamp) {
  if (!timestamp) return "Data não disponível";
  const data = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return data.toLocaleString("pt-BR");
}

function normalizarTelefone(valor) {
  return String(valor || "").replace(/\D/g, "");
}

/* ABAS DE LOGIN E CADASTRO */

document.querySelectorAll("[data-auth]").forEach(botao => {
  botao.addEventListener("click", () => {
    const cadastro = botao.dataset.auth === "cadastro";

    document.querySelectorAll(".aba-auth").forEach(aba => {
      aba.classList.toggle("ativa", aba === botao);
    });

    mostrar("form-login", !cadastro);
    mostrar("form-cadastro", cadastro);
    mensagem("auth-mensagem", "");
  });
});

/* CADASTRO DE CLIENTE */

$("form-cadastro").addEventListener("submit", async evento => {
  evento.preventDefault();

  const nome = $("cad-nome").value.trim();
  const email = $("cad-email").value.trim();
  const senha = $("cad-senha").value;
  const whatsapp = normalizarTelefone($("cad-whatsapp").value);
  const instagram = $("cad-instagram").value.trim();
  const endereco = $("cad-endereco").value.trim();

  if (!nome || !email || senha.length < 6 || !whatsapp || !endereco) {
    mensagem("auth-mensagem", "Preencha os campos obrigatórios corretamente.", true);
    return;
  }

  try {
    mensagem("auth-mensagem", "Criando sua conta...");

    const resultado = await createUserWithEmailAndPassword(auth, email, senha);

    await setDoc(doc(db, "profiles", resultado.user.uid), {
      name: nome,
      email,
      whatsapp,
      instagram,
      address: endereco,
      role: "customer",
      createdAt: serverTimestamp()
    });

    $("form-cadastro").reset();
    notificar("Conta criada com sucesso!");
  } catch (erro) {
    mensagem("auth-mensagem", traduzirErro(erro), true);
  }
});

/* LOGIN */

$("form-login").addEventListener("submit", async evento => {
  evento.preventDefault();

  try {
    mensagem("auth-mensagem", "Verificando acesso...");

    await signInWithEmailAndPassword(
      auth,
      $("login-email").value.trim(),
      $("login-senha").value
    );

    $("form-login").reset();
  } catch (erro) {
    mensagem("auth-mensagem", traduzirErro(erro), true);
  }
});

function traduzirErro(erro) {
  const codigo = erro?.code || "";

  const mensagens = {
    "auth/invalid-email": "O e-mail informado não é válido.",
    "auth/user-not-found": "Conta não encontrada.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/email-already-in-use": "Este e-mail já está cadastrado.",
    "auth/weak-password": "Use uma senha com pelo menos 6 caracteres.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco.",
    "storage/unauthorized": "Sem permissão para enviar esta foto.",
    "permission-denied": "Acesso negado pelas regras do Firebase."
  };

  return mensagens[codigo] || erro?.message || "Ocorreu um erro.";
}

/* SESSÃO E PERFIL */

onAuthStateChanged(auth, async usuario => {
  limparListeners();

  usuarioAtual = usuario;
  perfilAtual = null;
  carrinho = [];
  renderizarCarrinho();

  if (!usuario) {
    mostrar("area-autenticacao", true);
    mostrar("area-cliente", false);
    mostrar("area-dono", false);
    mostrar("area-motoboy", false);
    mostrar("btn-sair", false);
    $("usuario-logado").textContent = "";
    return;
  }

  try {
    const perfilRef = doc(db, "profiles", usuario.uid);
    const perfilSnap = await getDoc(perfilRef);

    if (!perfilSnap.exists()) {
      await signOut(auth);
      notificar("Perfil não encontrado. Faça seu cadastro novamente.");
      return;
    }

    perfilAtual = perfilSnap.data();

    mostrar("area-autenticacao", false);
    mostrar("btn-sair", true);
    $("usuario-logado").textContent = perfilAtual.name || usuario.email;

    if (perfilAtual.role === "owner") {
      mostrar("area-dono", true);
      iniciarProdutos();
      iniciarPedidosDono();
    } else if (perfilAtual.role === "courier") {
      mostrar("area-motoboy", true);
      iniciarPedidosMotoboy();
    } else {
      mostrar("area-cliente", true);
      iniciarProdutos();
      iniciarPedidosCliente();
    }
  } catch (erro) {
    notificar("Não foi possível carregar seu perfil: " + traduzirErro(erro));
  }
});

$("btn-sair").addEventListener("click", async () => {
  try {
    await signOut(auth);
    notificar("Você saiu da sua conta.");
  } catch (erro) {
    notificar(traduzirErro(erro));
  }
});

function limparListeners() {
  if (pararProdutos) pararProdutos();
  if (pararPedidos) pararPedidos();
  pararProdutos = null;
  pararPedidos = null;
}

/* CARDÁPIO */

function iniciarProdutos() {
  if (pararProdutos) pararProdutos();

  pararProdutos = onSnapshot(
    collection(db, "products"),
    snapshot => {
      produtos = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      produtos.sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), "pt-BR")
      );

      renderizarProdutos();
      renderizarProdutosDono();
    },
    erro => notificar("Erro ao carregar cardápio: " + traduzirErro(erro))
  );
}

$("busca-produto").addEventListener("input", renderizarProdutos);
$("filtro-categoria").addEventListener("change", renderizarProdutos);

function renderizarProdutos() {
  const area = $("lista-produtos");
  if (!area) return;

  const busca = $("busca-produto").value.trim().toLowerCase();
  const categoria = $("filtro-categoria").value;

  const filtrados = produtos.filter(produto => {
    const ativo = produto.active !== false;
    const texto = `${produto.name || ""} ${produto.description || ""}`.toLowerCase();

    return ativo &&
      texto.includes(busca) &&
      (categoria === "todos" || produto.category === categoria);
  });

  if (!filtrados.length) {
    area.innerHTML = '<p class="vazio">Nenhum produto encontrado.</p>';
    return;
  }

  area.innerHTML = filtrados.map(produto => `
    <article class="produto">
      <img
        class="produto-foto"
        src="${escapar(produto.imageUrl || imagemPadrao())}"
        alt="${escapar(produto.name)}"
        loading="lazy"
        onerror="this.src='${imagemPadrao()}'"
      >
      <div class="produto-conteudo">
        <h3>${escapar(produto.name)}</h3>
        <p class="produto-descricao">${escapar(produto.description || "Uma delícia esperando por você!")}</p>
        <div class="produto-rodape">
          <span class="preco">${dinheiro(produto.price)}</span>
          <button class="btn btn-principal" type="button" data-adicionar="${escapar(produto.id)}">
            + Adicionar
          </button>
        </div>
      </div>
    </article>
  `).join("");
}

function imagemPadrao() {
  return "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="100%" height="100%" fill="#f5e6dc"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="90">🍔</text></svg>'
    );
}

$("lista-produtos").addEventListener("click", evento => {
  const botao = evento.target.closest("[data-adicionar]");
  if (!botao) return;

  const produto = produtos.find(item => item.id === botao.dataset.adicionar);
  if (!produto) return;

  const existente = carrinho.find(item => item.id === produto.id);

  if (existente) {
    existente.quantity += 1;
  } else {
    carrinho.push({
      id: produto.id,
      name: produto.name,
      price: Number(produto.price),
      quantity: 1
    });
  }

  renderizarCarrinho();
  notificar("Produto adicionado ao carrinho!");
});

/* CARRINHO */

function renderizarCarrinho() {
  const area = $("itens-carrinho");
  if (!area) return;

  if (!carrinho.length) {
    area.innerHTML = '<p class="vazio">Seu carrinho está vazio.</p>';
    $("total-carrinho").textContent = dinheiro(0);
    return;
  }

  area.innerHTML = carrinho.map(item => `
    <div class="item-carrinho">
      <div>
        <strong>${escapar(item.name)}</strong><br>
        <small>${dinheiro(item.price)} cada</small>
      </div>
      <div class="item-acoes">
        <button class="btn-mini" type="button" data-diminuir="${escapar(item.id)}">−</button>
        <strong>${item.quantity}</strong>
        <button class="btn-mini" type="button" data-aumentar="${escapar(item.id)}">+</button>
      </div>
      <strong>${dinheiro(item.price * item.quantity)}</strong>
    </div>
  `).join("");

  const total = carrinho.reduce((soma, item) =>
    soma + item.price * item.quantity, 0
  );

  $("total-carrinho").textContent = dinheiro(total);
}

$("itens-carrinho").addEventListener("click", evento => {
  const aumentar = evento.target.closest("[data-aumentar]");
  const diminuir = evento.target.closest("[data-diminuir]");

  if (aumentar) {
    const item = carrinho.find(p => p.id === aumentar.dataset.aumentar);
    if (item) item.quantity++;
  }

  if (diminuir) {
    const item = carrinho.find(p => p.id === diminuir.dataset.diminuir);
    if (item) {
      item.quantity--;
      if (item.quantity <= 0) {
        carrinho = carrinho.filter(p => p.id !== item.id);
      }
    }
  }

  renderizarCarrinho();
});

$("limpar-carrinho").addEventListener("click", () => {
  carrinho = [];
  renderizarCarrinho();
});

/* FINALIZAÇÃO DO PEDIDO */

$("finalizar-pedido").addEventListener("click", async () => {
  if (enviandoPedido) return;

  if (!usuarioAtual || !perfilAtual) {
    notificar("Entre na sua conta antes de pedir.");
    return;
  }

  if (!carrinho.length) {
    notificar("Adicione produtos ao carrinho.");
    return;
  }

  if (!perfilAtual.address || !perfilAtual.whatsapp) {
    notificar("Atualize seu endereço e WhatsApp no cadastro.");
    return;
  }

  enviandoPedido = true;
  $("finalizar-pedido").disabled = true;

  try {
    const itens = carrinho.map(item => ({
      productId: item.id,
      name: item.name,
      price: Number(item.price),
      quantity: Number(item.quantity)
    }));

    const subtotal = itens.reduce((total, item) =>
      total + item.price * item.quantity, 0
    );

    await addDoc(collection(db, "orders"), {
      customerId: usuarioAtual.uid,
      customerName: perfilAtual.name || "",
      phone: perfilAtual.whatsapp,
      address: perfilAtual.address,
      instagram: perfilAtual.instagram || "",
      items: itens,
      subtotal,
      deliveryFee: 0,
      total: subtotal,
      paymentMethod: "A combinar na entrega",
      status: "pending",
      courierId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    carrinho = [];
    renderizarCarrinho();
    notificar("Pedido enviado! Aguarde a confirmação da lanchonete.");
  } catch (erro) {
    notificar("Não foi possível enviar o pedido: " + traduzirErro(erro));
  } finally {
    enviandoPedido = false;
    $("finalizar-pedido").disabled = false;
  }
});

/* PEDIDOS DO CLIENTE */

function iniciarPedidosCliente() {
  if (pararPedidos) pararPedidos();

  const consulta = query(
    collection(db, "orders"),
    where("customerId", "==", usuarioAtual.uid)
  );

  pararPedidos = onSnapshot(consulta, snapshot => {
    const lista = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    lista.sort((a, b) => {
      const dataA = a.createdAt?.toMillis?.() || 0;
      const dataB = b.createdAt?.toMillis?.() || 0;
      return dataB - dataA;
    });

    $("meus-pedidos").innerHTML = lista.length
      ? lista.map(pedidoHTMLCliente).join("")
      : '<p class="vazio">Você ainda não fez pedidos.</p>';
  }, erro => notificar("Erro ao consultar pedidos: " + traduzirErro(erro)));
}

function pedidoHTMLCliente(pedido) {
  const itens = (pedido.items || []).map(item =>
    `${escapar(item.quantity)}x ${escapar(item.name)}`
  ).join(", ");

  return `
    <div class="linha-pedido">
      <div>
        <strong>Pedido #${escapar(pedido.id.slice(0, 7))}</strong>
        <p class="texto-ajuda">${itens}</p>
        <small>${formatarData(pedido.createdAt)}</small>
      </div>
      <div>
        <span class="status">${escapar(STATUS[pedido.status] || pedido.status)}</span>
        <p><strong>${dinheiro(pedido.total)}</strong></p>
      </div>
    </div>
  `;
}

/* PAINEL DO DONO: CADASTRO DE PRODUTOS */

$("form-produto").addEventListener("submit", async evento => {
  evento.preventDefault();

  if (perfilAtual?.role !== "owner") return;

  const nome = $("produto-nome").value.trim();
  const descricao = $("produto-descricao").value.trim();
  const categoria = $("produto-categoria").value;
  const preco = Number($("produto-preco").value);
  const arquivo = $("produto-foto").files[0];

  if (!nome || !Number.isFinite(preco) || preco <= 0) {
    mensagem("produto-mensagem", "Informe nome e preço válido.", true);
    return;
  }

  if (arquivo) {
    const tipos = ["image/jpeg", "image/png", "image/gif"];

    if (!tipos.includes(arquivo.type) || arquivo.size > 2 * 1024 * 1024) {
      mensagem("produto-mensagem", "Use JPG, PNG ou GIF de até 2 MB.", true);
      return;
    }
  }

  try {
    mensagem("produto-mensagem", "Salvando produto...");

    let imageUrl = "";

    const produtoRef = doc(collection(db, "products"));

    if (arquivo) {
      const caminho = `products/${produtoRef.id}/${Date.now()}_${arquivo.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const arquivoRef = ref(storage, caminho);

      await uploadBytes(arquivoRef, arquivo, {
        contentType: arquivo.type
      });

      imageUrl = await getDownloadURL(arquivoRef);
    }

    await setDoc(produtoRef, {
      name: nome,
      description: descricao,
      category: categoria,
      price: preco,
      imageUrl,
      imagePath: imageUrl ? `products/${produtoRef.id}` : "",
      active: true,
      createdAt: serverTimestamp(),
      createdBy: usuarioAtual.uid
    });

    $("form-produto").reset();
    mensagem("produto-mensagem", "Produto cadastrado com sucesso!");
  } catch (erro) {
    mensagem("produto-mensagem", traduzirErro(erro), true);
  }
});

function renderizarProdutosDono() {
  const area = $("produtos-dono");
  if (!area) return;

  if (!produtos.length) {
    area.innerHTML = '<p class="vazio">Nenhum produto cadastrado.</p>';
    return;
  }

  area.innerHTML = produtos.map(produto => `
    <div class="produto-admin">
      <div>
        <strong>${escapar(produto.name)}</strong><br>
        <small>${dinheiro(produto.price)} · ${produto.active === false ? "Inativo" : "Ativo"}</small>
      </div>
      <div class="item-acoes">
        <button class="btn-mini" type="button" data-toggle-produto="${escapar(produto.id)}">
          ${produto.active === false ? "Ativar" : "Desativar"}
        </button>
        <button class="btn-mini" type="button" data-excluir-produto="${escapar(produto.id)}">
          Excluir
        </button>
      </div>
    </div>
  `).join("");
}

$("produtos-dono").addEventListener("click", async evento => {
  const alternar = evento.target.closest("[data-toggle-produto]");
  const excluir = evento.target.closest("[data-excluir-produto]");

  try {
    if (alternar) {
      const produto = produtos.find(p => p.id === alternar.dataset.toggleProduto);
      if (!produto) return;

      await updateDoc(doc(db, "products", produto.id), {
        active: produto.active === false,
        updatedAt: serverTimestamp()
      });

      notificar("Disponibilidade atualizada.");
    }

    if (excluir) {
      const produto = produtos.find(p => p.id === excluir.dataset.excluirProduto);
      if (!produto) return;

      if (!confirm(`Deseja excluir "${produto.name}"?`)) return;

      await deleteDoc(doc(db, "products", produto.id));

      notificar("Produto excluído.");
    }
  } catch (erro) {
    notificar("Erro: " + traduzirErro(erro));
  }
});

/* CADASTRAR / LIBERAR MOTOBOY */

$("ativar-motoboy").addEventListener("click", async () => {
  if (perfilAtual?.role !== "owner") return;

  const uid = $("uid-motoboy").value.trim();

  if (!uid || uid.length < 10) {
    mensagem("motoboy-mensagem", "Informe um UID válido.", true);
    return;
  }

  try {
    const perfilRef = doc(db, "profiles", uid);
    const perfilSnap = await getDoc(perfilRef);

    if (!perfilSnap.exists()) {
      mensagem("motoboy-mensagem", "Não encontrei esse usuário. Peça para o motoboy criar uma conta primeiro.", true);
      return;
    }

    await updateDoc(perfilRef, {
      role: "courier",
      updatedAt: serverTimestamp()
    });

    $("uid-motoboy").value = "";
    mensagem("motoboy-mensagem", "Motoboy liberado com sucesso!");
  } catch (erro) {
    mensagem("motoboy-mensagem", traduzirErro(erro), true);
  }
});

/* PEDIDOS DO DONO */

function iniciarPedidosDono() {
  if (pararPedidos) pararPedidos();

  pararPedidos = onSnapshot(
    collection(db, "orders"),
    snapshot => {
      pedidos = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      pedidos.sort((a, b) =>
        (b.createdAt?.toMillis?.() || 0) -
        (a.createdAt?.toMillis?.() || 0)
      );

      renderizarPedidosDono();
    },
    erro => notificar("Erro nos pedidos: " + traduzirErro(erro))
  );
}

function renderizarPedidosDono() {
  const area = $("pedidos-dono");
  if (!area) return;

  if (!pedidos.length) {
    area.innerHTML = '<p class="vazio">Nenhum pedido recebido.</p>';
    return;
  }

  area.innerHTML = pedidos.map(pedido => `
    <div class="linha-pedido">
      <div>
        <strong>Pedido #${escapar(pedido.id.slice(0, 7))} — ${escapar(pedido.customerName)}</strong>
        <p class="texto-ajuda">${(pedido.items || []).map(item =>
          `${escapar(item.quantity)}x ${escapar(item.name)}`
        ).join(", ")}</p>
        <p class="texto-ajuda">📍 ${escapar(pedido.address)}</p>
        <p class="texto-ajuda">📱 ${escapar(pedido.phone)}</p>
        <small>${formatarData(pedido.createdAt)}</small>
      </div>
      <div>
        <span class="status">${escapar(STATUS[pedido.status] || pedido.status)}</span>
        <p><strong>${dinheiro(pedido.total)}</strong></p>
        <div class="acoes-pedido">
          <select data-status-pedido="${escapar(pedido.id)}">
            ${Object.entries(STATUS).map(([valor, rotulo]) => `
              <option value="${valor}" ${pedido.status === valor ? "selected" : ""}>${rotulo}</option>
            `).join("")}
          </select>
          <input
            type="text"
            placeholder="UID do motoboy"
            value="${escapar(pedido.courierId || "")}"
            data-courier-pedido="${escapar(pedido.id)}"
          >
          <button class="btn btn-secundario" type="button" data-atribuir="${escapar(pedido.id)}">
            Atribuir
          </button>
        </div>
      </div>
    </div>
  `).join("");
}

$("pedidos-dono").addEventListener("change", async evento => {
  const select = evento.target.closest("[data-status-pedido]");
  if (!select) return;

  try {
    await updateDoc(doc(db, "orders", select.dataset.statusPedido), {
      status: select.value,
      updatedAt: serverTimestamp()
    });

    notificar("Status do pedido atualizado.");
  } catch (erro) {
    notificar("Erro ao atualizar: " + traduzirErro(erro));
  }
});

$("pedidos-dono").addEventListener("click", async evento => {
  const botao = evento.target.closest("[data-atribuir]");
  if (!botao) return;

  const id = botao.dataset.atribuir;
  const campo = document.querySelector(`[data-courier-pedido="${CSS.escape(id)}"]`);
  const uid = campo?.value.trim();

  if (!uid) {
    notificar("Informe o UID do motoboy.");
    return;
  }

  try {
    const perfilMotoboy = await getDoc(doc(db, "profiles", uid));

    if (!perfilMotoboy.exists() || perfilMotoboy.data().role !== "courier") {
      notificar("Esse UID não pertence a um motoboy liberado.");
      return;
    }

    await updateDoc(doc(db, "orders", id), {
      courierId: uid,
      updatedAt: serverTimestamp()
    });

    notificar("Entrega atribuída ao motoboy.");
  } catch (erro) {
    notificar("Erro: " + traduzirErro(erro));
  }
});

/* ÁREA DO MOTOBOY */

function iniciarPedidosMotoboy() {
  if (pararPedidos) pararPedidos();

  const consulta = query(
    collection(db, "orders"),
    where("courierId", "==", usuarioAtual.uid)
  );

  pararPedidos = onSnapshot(consulta, snapshot => {
    const lista = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    lista.sort((a, b) =>
      (b.createdAt?.toMillis?.() || 0) -
      (a.createdAt?.toMillis?.() || 0)
    );

    $("pedidos-motoboy").innerHTML = lista.length
      ? lista.map(pedidoHTMLMotoboy).join("")
      : '<p class="vazio">Você ainda não tem entregas atribuídas.</p>';
  }, erro => notificar("Erro ao consultar entregas: " + traduzirErro(erro)));
}

function pedidoHTMLMotoboy(pedido) {
  const endereco = encodeURIComponent(pedido.address || "");
  const mapa = `https://www.google.com/maps/search/?api=1&query=${endereco}`;

  return `
    <div class="linha-pedido">
      <div>
        <strong>Entrega #${escapar(pedido.id.slice(0, 7))}</strong>
        <p>${escapar(pedido.customerName)}</p>
        <p class="texto-ajuda">📍 ${escapar(pedido.address)}</p>
        <p class="texto-ajuda">📱 ${escapar(pedido.phone)}</p>
        <span class="status">${escapar(STATUS[pedido.status] || pedido.status)}</span>
        <p><a href="${mapa}" target="_blank" rel="noopener">Abrir endereço no mapa</a></p>
      </div>
      <div>
        <strong>${dinheiro(pedido.total)}</strong>
        <div class="acoes-pedido">
          <select data-status-motoboy="${escapar(pedido.id)}">
            <option value="out_for_delivery" ${pedido.status === "out_for_delivery" ? "selected" : ""}>Saiu para entrega</option>
            <option value="delivered" ${pedido.status === "delivered" ? "selected" : ""}>Entregue</option>
          </select>
        </div>
      </div>
    </div>
  `;
}

$("pedidos-motoboy").addEventListener("change", async evento => {
  const select = evento.target.closest("[data-status-motoboy]");
  if (!select) return;

  try {
    await updateDoc(doc(db, "orders", select.dataset.statusMotoboy), {
      status: select.value,
      updatedAt: serverTimestamp()
    });

    notificar("Entrega atualizada.");
  } catch (erro) {
    notificar("Erro ao atualizar entrega: " + traduzirErro(erro));
  }
});
