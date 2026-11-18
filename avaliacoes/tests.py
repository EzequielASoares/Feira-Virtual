from decimal import Decimal

from rest_framework.test import APITestCase

from avaliacoes.models import Reclamacao
from catalogo.models import Categoria, Produto
from pedidos.models import ItemPedido, Pedido
from usuarios.models import PerfilProdutor, Usuario

PW = "Senha-Forte-123"


class AvaliacoesReclamacoesTests(APITestCase):
    def setUp(self):
        self.admin = Usuario.objects.create_superuser("admin", "admin@ex.com", PW)
        self.client.post("/api/auth/registro/cliente/", {"username": "cli1", "email": "cli1@ex.com", "password": PW}, format="json")
        self.client.post("/api/auth/registro/cliente/", {"username": "cli2", "email": "cli2@ex.com", "password": PW}, format="json")
        self.client.post(
            "/api/auth/registro/produtor/",
            {"username": "prod1", "email": "prod1@ex.com", "password": PW, "nome_propriedade": "Horta Feliz"},
            format="json",
        )
        self.cli1 = Usuario.objects.get(username="cli1")
        self.produtor = PerfilProdutor.objects.get(usuario__username="prod1")
        self.produtor.status = PerfilProdutor.Status.APROVADO
        self.produtor.save()
        self.cat = Categoria.objects.create(nome="Verduras")
        self.produto = Produto.objects.create(
            produtor=self.produtor, categoria=self.cat, nome="Couve", preco=Decimal("4.00"), estoque=Decimal("10")
        )
        self.pedido = Pedido.objects.create(
            cliente=self.cli1, produtor=self.produtor, modalidade=Pedido.Modalidade.RETIRADA,
            forma_pagamento=Pedido.FormaPagamento.DINHEIRO, status=Pedido.Status.CONCLUIDO, total=Decimal("8.00"),
        )
        ItemPedido.objects.create(
            pedido=self.pedido, produto=self.produto, nome_produto="Couve",
            unidade_medida="MACO", preco_unitario=Decimal("4.00"), quantidade=Decimal("2"),
        )

    def _auth(self, username):
        token = self.client.post("/api/auth/login/", {"username": username, "password": PW}, format="json").data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_avaliacao_produto_produtor_e_validacoes(self):
        self._auth("cli1")
        # Não pode informar produto E produtor juntos
        bad = self.client.post("/api/avaliacoes/", {"produto": self.produto.id, "produtor": self.produtor.id, "nota": 5}, format="json")
        self.assertEqual(bad.status_code, 400)

        # Avaliar produtor ok
        ok_prod = self.client.post("/api/avaliacoes/", {"produtor": self.produtor.id, "nota": 5, "comentario": "Excelente"}, format="json")
        self.assertEqual(ok_prod.status_code, 201)

        # Produtor consulta avaliações recebidas
        self._auth("prod1")
        av_list = self.client.get("/api/produtor/avaliacoes/")
        self.assertEqual(av_list.status_code, 200)
        self.assertEqual(av_list.data["count"], 1)

    def test_reclamacao_cliente_e_resposta_admin(self):
        # Cliente 2 não pode reclamar do pedido do Cliente 1
        self._auth("cli2")
        r_forb = self.client.post("/api/reclamacoes/", {"pedido": self.pedido.id, "assunto": "Atraso", "descricao": "Teste"}, format="json")
        self.assertEqual(r_forb.status_code, 400)

        self._auth("cli1")
        r_ok = self.client.post("/api/reclamacoes/", {"pedido": self.pedido.id, "assunto": "Item amassado", "descricao": "Veio amassado"}, format="json")
        self.assertEqual(r_ok.status_code, 201)
        rec_id = r_ok.data["id"]

        self._auth("admin")
        r_upd = self.client.patch(
            f"/api/admin/reclamacoes/{rec_id}/",
            {"status": Reclamacao.Status.RESOLVIDA, "resposta_admin": "Reembolso efetuado."},
            format="json",
        )
        self.assertEqual(r_upd.status_code, 200)
        self.assertEqual(r_upd.data["status"], "RESOLVIDA")
