"""Serviços administrativos e cálculo de indicadores do painel."""
from decimal import Decimal

from django.db.models import Count, Sum
from rest_framework.exceptions import ValidationError

from avaliacoes.models import Reclamacao
from catalogo.models import Produto
from pedidos.models import Pedido
from usuarios.models import PerfilProdutor, Usuario


def alterar_status_usuario(usuario_alvo, usuario_admin, ativo):
    if usuario_alvo.pk == usuario_admin.pk:
        raise ValidationError("Você não pode bloquear a própria conta.")
    usuario_alvo.is_active = ativo
    usuario_alvo.save(update_fields=["is_active"])
    return usuario_alvo


def alterar_status_produtor(perfil, novo_status):
    perfil.status = novo_status
    perfil.save(update_fields=["status"])
    return perfil


def alterar_visibilidade_produto(produto, ativo):
    produto.ativo = ativo
    produto.save(update_fields=["ativo"])
    return produto


def obter_indicadores():
    concluidos = Pedido.objects.filter(status=Pedido.Status.CONCLUIDO)
    return {
        "usuarios_por_tipo": dict(Usuario.objects.values_list("tipo").annotate(n=Count("id"))),
        "produtores_por_status": dict(PerfilProdutor.objects.values_list("status").annotate(n=Count("id"))),
        "produtos_ativos": Produto.objects.filter(ativo=True).count(),
        "pedidos_por_status": dict(Pedido.objects.values_list("status").annotate(n=Count("id"))),
        "vendas_concluidas": concluidos.count(),
        "faturamento_total": concluidos.aggregate(t=Sum("total"))["t"] or Decimal("0.00"),
        "reclamacoes_abertas": Reclamacao.objects.filter(status=Reclamacao.Status.ABERTA).count(),
    }
