"""Regras de negócio de carrinho, pedidos, entregas e estoque."""
from collections import defaultdict
from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from catalogo.models import Produto
from usuarios.models import PerfilProdutor

from .models import Carrinho, HistoricoStatus, ItemCarrinho, ItemPedido, Pedido

S = Pedido.Status

TRANSICOES = {
    S.PENDENTE: {S.ACEITO, S.RECUSADO, S.CANCELADO},
    S.ACEITO: {S.EM_PREPARO, S.CANCELADO},
    S.EM_PREPARO: {S.PRONTO, S.CANCELADO},
    S.PRONTO: {S.EM_ENTREGA, S.CONCLUIDO, S.CANCELADO},
    S.EM_ENTREGA: {S.CONCLUIDO},
}


def validar_pagamento(produtor, forma):
    if forma == Pedido.FormaPagamento.PIX and not produtor.chave_pix:
        raise ValidationError(f"{produtor.nome_propriedade} não aceita Pix.")
    if forma == Pedido.FormaPagamento.CARTAO and not produtor.possui_maquininha:
        raise ValidationError(f"{produtor.nome_propriedade} não possui maquininha de cartão.")
    if forma == Pedido.FormaPagamento.DINHEIRO and not produtor.aceita_dinheiro:
        raise ValidationError(f"{produtor.nome_propriedade} não aceita dinheiro.")


def _registrar(pedido):
    HistoricoStatus.objects.create(pedido=pedido, status=pedido.status)


@transaction.atomic
def adicionar_item_carrinho(carrinho, produto_id, quantidade):
    """Adiciona ou incrementa item no carrinho travando o produto para leitura consistente do estoque."""
    carrinho = Carrinho.objects.select_for_update().get(pk=carrinho.pk)
    produto = Produto.objects.select_for_update().select_related("produtor", "categoria").get(pk=produto_id)
    if (
        not produto.ativo
        or not produto.categoria.ativa
        or produto.produtor.status != PerfilProdutor.Status.APROVADO
        or not produto.produtor.usuario.is_active
    ):
        raise ValidationError("Produto indisponível.")

    item = ItemCarrinho.objects.select_for_update().filter(carrinho=carrinho, produto=produto).first()
    nova_qtd = quantidade + (item.quantidade if item else Decimal("0"))
    if nova_qtd > produto.estoque:
        raise ValidationError(f"Quantidade acima do estoque disponível ({produto.estoque}).")

    if item:
        item.quantidade = nova_qtd
        item.save(update_fields=["quantidade"])
        return item, False

    item = ItemCarrinho.objects.create(carrinho=carrinho, produto=produto, quantidade=quantidade)
    return item, True


@transaction.atomic
def atualizar_item_carrinho(item_id, cliente, quantidade):
    """Atualiza quantidade de item existente no carrinho com lock transacional."""
    item = (
        ItemCarrinho.objects
        .select_for_update()
        .select_related("produto__produtor", "produto__categoria")
        .filter(pk=item_id, carrinho__cliente=cliente)
        .first()
    )
    if not item:
        return None
    produto = Produto.objects.select_for_update().get(pk=item.produto_id)
    if (
        not produto.ativo
        or not produto.categoria.ativa
        or produto.produtor.status != PerfilProdutor.Status.APROVADO
    ):
        raise ValidationError("Produto indisponível.")
    if quantidade > produto.estoque:
        raise ValidationError(f"Quantidade acima do estoque disponível ({produto.estoque}).")
    item.quantidade = quantidade
    item.save(update_fields=["quantidade"])
    return item


@transaction.atomic
def finalizar_carrinho(cliente, modalidade, endereco, forma_pagamento, observacao=""):
    """Transforma o carrinho em pedidos (um por produtor) com lock transacional."""
    carrinho, _ = Carrinho.objects.get_or_create(cliente=cliente)
    carrinho = Carrinho.objects.select_for_update().get(pk=carrinho.pk)
    itens = list(carrinho.itens.select_related("produto__produtor", "produto__categoria").order_by("produto_id"))
    if not itens:
        raise ValidationError("Não é possível finalizar uma compra sem produtos no carrinho.")
    if modalidade == Pedido.Modalidade.ENTREGA and endereco is None:
        raise ValidationError({"endereco_id": "Informe o endereço de entrega."})

    # Trava os produtos envolvidos em ordem determinística de ID para evitar deadlock
    produto_ids = sorted({item.produto_id for item in itens})
    produtos_travados = {
        p.id: p
        for p in Produto.objects.select_for_update()
        .select_related("produtor__usuario", "categoria")
        .filter(id__in=produto_ids)
        .order_by("id")
    }

    por_produtor = defaultdict(list)
    for item in itens:
        p = produtos_travados.get(item.produto_id)
        if (
            not p
            or not p.ativo
            or not p.categoria.ativa
            or p.produtor.status != PerfilProdutor.Status.APROVADO
            or not p.produtor.usuario.is_active
        ):
            nome = p.nome if p else f"#{item.produto_id}"
            raise ValidationError(f"O produto '{nome}' não está mais disponível.")
        if item.quantidade > p.estoque:
            raise ValidationError(f"Estoque insuficiente para '{p.nome}' (disponível: {p.estoque}).")
        por_produtor[p.produtor].append((item, p))

    pedidos = []
    for produtor, pares in por_produtor.items():
        validar_pagamento(produtor, forma_pagamento)
        pedido = Pedido.objects.create(
            cliente=cliente,
            produtor=produtor,
            modalidade=modalidade,
            forma_pagamento=forma_pagamento,
            endereco_entrega=endereco.como_texto() if (endereco and modalidade == Pedido.Modalidade.ENTREGA) else "",
            observacao=observacao,
        )
        total = Decimal("0.00")
        for it, prod in pares:
            ip = ItemPedido.objects.create(
                pedido=pedido,
                produto=prod,
                nome_produto=prod.nome,
                unidade_medida=prod.unidade_medida,
                preco_unitario=prod.preco,
                quantidade=it.quantidade,
            )
            total += ip.subtotal
        pedido.total = total
        pedido.save(update_fields=["total"])
        _registrar(pedido)
        pedidos.append(pedido)

    carrinho.itens.all().delete()
    return pedidos


def _baixar_estoque(pedido):
    itens = list(pedido.itens.select_related("produto").order_by("produto_id"))
    for item in itens:
        if item.produto_id is None:
            raise ValidationError(f"O produto '{item.nome_produto}' foi removido; não é possível aceitar.")
    produto_ids = sorted({item.produto_id for item in itens})
    produtos_travados = {
        p.id: p
        for p in Produto.objects.select_for_update().filter(id__in=produto_ids).order_by("id")
    }
    for item in itens:
        produto = produtos_travados.get(item.produto_id)
        if not produto:
            raise ValidationError(f"O produto '{item.nome_produto}' foi removido; não é possível aceitar.")
        if item.quantidade > produto.estoque:
            raise ValidationError(f"Estoque insuficiente para '{produto.nome}' (disponível: {produto.estoque}).")
        produto.estoque -= item.quantidade
        produto.save(update_fields=["estoque"])
    pedido.estoque_baixado = True


def _devolver_estoque(pedido):
    itens = [it for it in pedido.itens.select_related("produto").order_by("produto_id") if it.produto_id is not None]
    if itens:
        produto_ids = sorted({it.produto_id for it in itens})
        produtos_travados = {
            p.id: p
            for p in Produto.objects.select_for_update().filter(id__in=produto_ids).order_by("id")
        }
        for item in itens:
            produto = produtos_travados.get(item.produto_id)
            if produto:
                produto.estoque += item.quantidade
                produto.save(update_fields=["estoque"])
    pedido.estoque_baixado = False


@transaction.atomic
def mudar_status(pedido, novo, usuario):
    """Aplica uma transição respeitando quem pode fazê-la e o fluxo permitido."""
    pedido = Pedido.objects.select_for_update().select_related("produtor__usuario").get(pk=pedido.pk)
    novo = S(novo)
    if novo not in TRANSICOES.get(S(pedido.status), set()):
        raise ValidationError(f"Não é possível ir de '{pedido.get_status_display()}' para '{novo.label}'.")

    tipo = usuario.tipo
    if tipo == "CLIENTE":
        if pedido.cliente_id != usuario.id or novo != S.CANCELADO or pedido.status not in (S.PENDENTE, S.ACEITO):
            raise ValidationError("O cliente só pode cancelar pedidos ainda não iniciados.")
    elif tipo == "PRODUTOR":
        if pedido.produtor.usuario_id != usuario.id:
            raise ValidationError("Apenas o produtor responsável pode atualizar este pedido.")
        if novo == S.ACEITO and (
            pedido.produtor.status != PerfilProdutor.Status.APROVADO or not pedido.produtor.usuario.is_active
        ):
            raise ValidationError("Produtor não está aprovado para aceitar pedidos.")
        if novo == S.EM_ENTREGA:
            raise ValidationError("A saída para entrega é registrada pelo entregador.")
        if novo == S.CONCLUIDO and pedido.modalidade != Pedido.Modalidade.RETIRADA:
            raise ValidationError("Pedidos com entrega são concluídos pelo entregador.")
    elif tipo == "ENTREGADOR":
        if pedido.entregador_id != usuario.id or novo not in (S.EM_ENTREGA, S.CONCLUIDO):
            raise ValidationError("Ação não permitida para este entregador.")
    else:
        raise ValidationError("Ação não permitida.")

    if novo == S.ACEITO:
        _baixar_estoque(pedido)
    elif novo in (S.CANCELADO, S.RECUSADO) and pedido.estoque_baixado:
        _devolver_estoque(pedido)
        if novo == S.CANCELADO:
            pedido.entregador = None

    pedido.status = novo
    pedido.save()
    _registrar(pedido)
    return pedido


@transaction.atomic
def atribuir_entregador(pedido_id, usuario):
    """Atribui entrega ao primeiro entregador disponível usando lock transacional."""
    pedido = Pedido.objects.select_for_update().filter(pk=pedido_id).first()
    if (
        not pedido
        or pedido.modalidade != Pedido.Modalidade.ENTREGA
        or pedido.entregador_id is not None
        or pedido.status not in (S.ACEITO, S.EM_PREPARO, S.PRONTO)
    ):
        raise ValidationError("Entrega indisponível ou já atribuída a outro entregador.")
    pedido.entregador = usuario
    pedido.save(update_fields=["entregador", "atualizado_em"])
    return pedido
