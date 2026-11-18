from django.test import override_settings
from rest_framework.test import APIClient, APITestCase

from usuarios.models import Endereco, PerfilProdutor, Usuario

PW = "Senha-Forte-123"


class UsuariosAuthTests(APITestCase):
    def setUp(self):
        self.admin = Usuario.objects.create_superuser("admin", "admin@ex.com", PW)

    def test_registros_e_email_duplicado(self):
        r1 = self.client.post(
            "/api/auth/registro/cliente/",
            {"username": "ana", "email": "Ana@Ex.com", "password": PW, "first_name": "Ana"},
            format="json",
        )
        self.assertEqual(r1.status_code, 201)

        r_dup = self.client.post(
            "/api/auth/registro/cliente/",
            {"username": "ana2", "email": "ana@ex.com", "password": PW},
            format="json",
        )
        self.assertEqual(r_dup.status_code, 400)

        r_prod = self.client.post(
            "/api/auth/registro/produtor/",
            {
                "username": "sitio",
                "email": "sitio@ex.com",
                "password": PW,
                "nome_propriedade": "Sítio Verde",
                "chave_pix": "sitio@pix",
            },
            format="json",
        )
        self.assertEqual(r_prod.status_code, 201)
        self.assertEqual(PerfilProdutor.objects.get(usuario__username="sitio").status, "PENDENTE")

        r_ent = self.client.post(
            "/api/auth/registro/entregador/",
            {"username": "moto1", "email": "moto@ex.com", "password": PW, "veiculo": "Moto"},
            format="json",
        )
        self.assertEqual(r_ent.status_code, 201)

    def test_autenticacao_cookie_httponly_e_csrf(self):
        self.client.post(
            "/api/auth/registro/cliente/",
            {"username": "carlos", "email": "carlos@ex.com", "password": PW},
            format="json",
        )

        # Cliente com CSRF habilitado (simulando navegador)
        browser = APIClient(enforce_csrf_checks=True)
        csrf_res = browser.get("/api/auth/csrf/")
        self.assertEqual(csrf_res.status_code, 200)
        csrf_token = csrf_res.cookies["csrftoken"].value

        login_res = browser.post(
            "/api/auth/login/",
            {"username": "carlos", "password": PW},
            format="json",
            HTTP_X_AUTH_MODE="cookie",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(login_res.status_code, 200)
        self.assertNotIn("access", login_res.data)
        self.assertNotIn("refresh", login_res.data)
        self.assertIn("fv_access_token", login_res.cookies)
        self.assertTrue(login_res.cookies["fv_access_token"]["httponly"])
        self.assertIn("fv_refresh_token", login_res.cookies)
        self.assertTrue(login_res.cookies["fv_refresh_token"]["httponly"])

        # GET autenticado via cookie
        me = browser.get("/api/perfil/")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data["username"], "carlos")

        # POST via cookie sem CSRF deve falhar com 403
        no_csrf = browser.post(
            "/api/enderecos/",
            {"logradouro": "Rua B", "numero": "2", "bairro": "Centro", "cidade": "Natal", "estado": "RN"},
            format="json",
        )
        self.assertEqual(no_csrf.status_code, 403)

        # POST via cookie COM CSRF deve funcionar
        csrf_after = browser.cookies["csrftoken"].value
        with_csrf = browser.post(
            "/api/enderecos/",
            {"logradouro": "Rua B", "numero": "2", "bairro": "Centro", "cidade": "Natal", "estado": "RN"},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_after,
        )
        self.assertEqual(with_csrf.status_code, 201)

        # Refresh via cookie HttpOnly
        ref_res = browser.post("/api/auth/refresh/", {}, format="json", HTTP_X_CSRFTOKEN=csrf_after)
        self.assertEqual(ref_res.status_code, 200)
        self.assertNotIn("access", ref_res.data)

        # Logout via cookie limpa cookies
        out_res = browser.post("/api/auth/logout/", {}, format="json", HTTP_X_CSRFTOKEN=csrf_after)
        self.assertEqual(out_res.status_code, 204)
        self.assertEqual(out_res.cookies["fv_access_token"].value, "")

    def test_listagem_publica_produtores_e_isolamento_enderecos(self):
        self.client.post(
            "/api/auth/registro/produtor/",
            {
                "username": "p1",
                "email": "p1@ex.com",
                "password": PW,
                "nome_propriedade": "Fazenda Sol",
                "chave_pix": "segredo-pix",
            },
            format="json",
        )
        # Pendente não aparece publicamente
        self.assertEqual(self.client.get("/api/produtores/").data["count"], 0)

        perfil = PerfilProdutor.objects.get(usuario__username="p1")
        perfil.status = PerfilProdutor.Status.APROVADO
        perfil.save()

        pub = self.client.get("/api/produtores/")
        self.assertEqual(pub.status_code, 200)
        self.assertEqual(pub.data["count"], 1)
        row = pub.data["results"][0]
        self.assertTrue(row["aceita_pix"])
        self.assertNotIn("chave_pix", row)

        # Isolamento de endereços
        self.client.post("/api/auth/registro/cliente/", {"username": "c1", "email": "c1@ex.com", "password": PW}, format="json")
        self.client.post("/api/auth/registro/cliente/", {"username": "c2", "email": "c2@ex.com", "password": PW}, format="json")
        t1 = self.client.post("/api/auth/login/", {"username": "c1", "password": PW}, format="json").data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {t1}")
        end_id = self.client.post(
            "/api/enderecos/",
            {"logradouro": "Rua 1", "numero": "1", "bairro": "B", "cidade": "Natal", "estado": "RN"},
            format="json",
        ).data["id"]

        t2 = self.client.post("/api/auth/login/", {"username": "c2", "password": PW}, format="json").data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {t2}")
        self.assertEqual(self.client.get(f"/api/enderecos/{end_id}/").status_code, 404)
        self.assertTrue(Endereco.objects.filter(pk=end_id).exists())
