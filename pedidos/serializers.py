from rest_framework import serializers

from usuarios.models import Endereco

from .models import Carrinho, HistoricoStatus, ItemCarrinho, ItemPedido, Pedido


class ItemCarrinhoSerializer(serializers.ModelSerializer):
    produto_nome = serializers.CharField(source="produto.nome", read_only=True)
    preco_unitario = serializers.DecimalField(source="produto.preco", max_digits=10, decimal_places=2, read_only=True)
    unidade_medida = serializers.CharField(source="produto.unidade_medida", read_only=True)
    estoque_disponivel = serializers.DecimalField(source="produto.estoque", max_digits=10, decimal_places=3, read_only=True)
    produtor_id = serializers.IntegerField(source="produto.produtor_id", read_only=True)
    produtor_nome = serializers.CharField(source="produto.produtor.nome_propriedade", read_only=True)
    produtor_aceita_pix = serializers.SerializerMethodField()
    produtor_possui_maquininha = serializers.BooleanField(source="produto.produtor.possui_maquininha", read_only=True)
    produtor_aceita_dinheiro = serializers.BooleanField(source="produto.produtor.aceita_dinheiro", read_only=True)
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = ItemCarrinho
        fields = [
            "id", "produto", "produto_nome", "preco_unitario", "unidade_medida",
            "estoque_disponivel", "produtor_id", "produtor_nome",
            "produtor_aceita_pix", "produtor_possui_maquininha", "produtor_aceita_dinheiro",
            "quantidade", "subtotal",
        ]

    def get_produtor_aceita_pix(self, obj):
        return bool(obj.produto.produtor.chave_pix)

    def validate(self, attrs):
        produto = attrs.get("produto") or self.instance.produto
        qtd = attrs.get("quantidade", getattr(self.instance, "quantidade", 0))
        if not produto.ativo or not produto.categoria.ativa or produto.produtor.status != "APROVADO":
            raise serializers.ValidationError("Produto indisponível.")
        if self.instance is None:
            existente = ItemCarrinho.objects.filter(
                carrinho=self.context["carrinho"], produto=produto
            ).first()
            if existente:
                qtd = qtd + existente.quantidade
        if qtd > produto.estoque:
            raise serializers.ValidationError(f"Quantidade acima do estoque disponível ({produto.estoque}).")
        return attrs


class CarrinhoSerializer(serializers.ModelSerializer):
    itens = ItemCarrinhoSerializer(many=True, read_only=True)
    total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = Carrinho
        fields = ["id", "itens", "total"]


class ItemPedidoSerializer(serializers.ModelSerializer):
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = ItemPedido
        fields = ["id", "produto", "nome_produto", "unidade_medida", "preco_unitario", "quantidade", "subtotal"]


class HistoricoSerializer(serializers.ModelSerializer):
    class Meta:
        model = HistoricoStatus
        fields = ["status", "criado_em"]


class PedidoSerializer(serializers.ModelSerializer):
    itens = ItemPedidoSerializer(many=True, read_only=True)
    historico = HistoricoSerializer(many=True, read_only=True)
    produtor_nome = serializers.CharField(source="produtor.nome_propriedade", read_only=True)
    cliente_nome = serializers.CharField(source="cliente.get_full_name", read_only=True)
    cliente_username = serializers.CharField(source="cliente.username", read_only=True)
    entregador_nome = serializers.SerializerMethodField()

    class Meta:
        model = Pedido
        fields = [
            "id", "status", "modalidade", "forma_pagamento", "endereco_entrega", "observacao", "total",
            "produtor", "produtor_nome", "cliente", "cliente_nome", "cliente_username",
            "entregador", "entregador_nome", "itens", "historico", "criado_em", "atualizado_em",
        ]
        read_only_fields = fields

    def get_entregador_nome(self, obj):
        if not obj.entregador:
            return None
        return obj.entregador.get_full_name() or obj.entregador.username


class CheckoutSerializer(serializers.Serializer):
    modalidade = serializers.ChoiceField(choices=Pedido.Modalidade.choices)
    forma_pagamento = serializers.ChoiceField(choices=Pedido.FormaPagamento.choices)
    endereco_id = serializers.IntegerField(required=False)
    observacao = serializers.CharField(required=False, allow_blank=True, max_length=255)

    def validate(self, attrs):
        endereco = None
        if attrs["modalidade"] == Pedido.Modalidade.ENTREGA:
            if "endereco_id" not in attrs:
                raise serializers.ValidationError({"endereco_id": "Informe o endereço de entrega."})
            try:
                endereco = Endereco.objects.get(pk=attrs["endereco_id"], usuario=self.context["request"].user)
            except Endereco.DoesNotExist:
                raise serializers.ValidationError({"endereco_id": "Endereço não encontrado."})
        attrs["endereco"] = endereco
        return attrs


class StatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Pedido.Status.choices)
