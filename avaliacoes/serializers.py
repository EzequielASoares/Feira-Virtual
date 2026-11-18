from rest_framework import serializers

from pedidos.models import ItemPedido, Pedido

from .models import Avaliacao, Reclamacao


class AvaliacaoSerializer(serializers.ModelSerializer):
    cliente_nome = serializers.SerializerMethodField()
    produto_nome = serializers.CharField(source="produto.nome", read_only=True, default=None)
    produtor_nome = serializers.CharField(source="produtor.nome_propriedade", read_only=True, default=None)

    class Meta:
        model = Avaliacao
        fields = [
            "id", "produto", "produto_nome", "produtor", "produtor_nome",
            "nota", "comentario", "cliente_nome", "criado_em",
        ]
        read_only_fields = ["criado_em"]

    def get_cliente_nome(self, obj):
        return obj.cliente.first_name or obj.cliente.username

    def validate(self, attrs):
        produto, produtor = attrs.get("produto"), attrs.get("produtor")
        if bool(produto) == bool(produtor):
            raise serializers.ValidationError("Informe 'produto' OU 'produtor' (apenas um).")
        user = self.context["request"].user
        if produto:
            comprou = ItemPedido.objects.filter(
                produto=produto, pedido__cliente=user, pedido__status=Pedido.Status.CONCLUIDO
            ).exists()
            ja = Avaliacao.objects.filter(cliente=user, produto=produto).exists()
        else:
            comprou = Pedido.objects.filter(
                produtor=produtor, cliente=user, status=Pedido.Status.CONCLUIDO
            ).exists()
            ja = Avaliacao.objects.filter(cliente=user, produtor=produtor).exists()
        if not comprou:
            raise serializers.ValidationError("Somente clientes que compraram (pedido concluído) podem avaliar.")
        if ja:
            raise serializers.ValidationError("Você já avaliou este item.")
        return attrs


class ReclamacaoSerializer(serializers.ModelSerializer):
    produtor_nome = serializers.CharField(source="pedido.produtor.nome_propriedade", read_only=True)
    pedido_status = serializers.CharField(source="pedido.status", read_only=True)

    class Meta:
        model = Reclamacao
        fields = [
            "id", "pedido", "produtor_nome", "pedido_status",
            "assunto", "descricao", "status", "resposta_admin", "criado_em",
        ]
        read_only_fields = ["status", "resposta_admin", "criado_em"]

    def validate_pedido(self, pedido):
        if pedido.cliente_id != self.context["request"].user.id:
            raise serializers.ValidationError("Pedido não encontrado.")
        return pedido


class ReclamacaoAdminSerializer(serializers.ModelSerializer):
    cliente_username = serializers.CharField(source="cliente.username", read_only=True)
    cliente_nome = serializers.SerializerMethodField()
    produtor_nome = serializers.CharField(source="pedido.produtor.nome_propriedade", read_only=True)
    pedido_total = serializers.DecimalField(source="pedido.total", max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = Reclamacao
        fields = [
            "id", "cliente", "cliente_username", "cliente_nome",
            "pedido", "produtor_nome", "pedido_total",
            "assunto", "descricao", "status", "resposta_admin", "criado_em",
        ]
        read_only_fields = ["cliente", "pedido", "assunto", "descricao", "criado_em"]

    def get_cliente_nome(self, obj):
        return obj.cliente.get_full_name() or obj.cliente.username
