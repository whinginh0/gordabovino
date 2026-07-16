import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!;

const EMAIL_TEMPLATE = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 0; }
        .wrapper { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; }
        .header { text-align: center; margin-bottom: 24px; }
        .important-notice { background-color: #fdf2e9; border-left: 4px solid #e67e22; color: #4a2711; padding: 15px; border-radius: 4px; margin-bottom: 24px; font-size: 0.9rem; }
        .plan-box { background-color: #fdf2e9; border: 1px solid #dfd0be; border-radius: 6px; padding: 15px; margin-bottom: 24px; }
        .plan-title { font-weight: bold; color: #4a2711; }
        .bump-card { background: linear-gradient(135deg, #e67e22, #d35400); border: 2px dashed #4a2711; border-radius: 8px; padding: 15px; margin-bottom: 24px; text-align: center; }
        .bump-title { font-weight: bold; color: #ffffff; font-size: 0.95rem; }
        .cta-button { display: inline-block; background-color: #e67e22; color: #ffffff !important; font-weight: bold; text-decoration: none; padding: 14px 28px; border-radius: 30px; margin: 15px 0; text-align: center; }
        .raw-link { font-size: 0.8rem; color: #757575; word-break: break-all; margin-top: 10px; }
        .footer { font-size: 0.75rem; color: #9e9e9e; text-align: center; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 15px; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="header">
            <h2>Acesso Liberado! 🚀</h2>
        </div>

        <!-- AVISO IMPORTANTE: APENAS LOGIN SEM SENHA CONVENCIONAL -->
        <div class="important-notice">
            <strong>⚠️ COMO ACESSAR:</strong> O seu login é realizado inserindo apenas o seu e-mail de compra (<strong>{{params.EMAIL}}</strong>). Não é necessário criar ou utilizar nenhuma senha convencional no sistema para acessar.
        </div>

        <p>Olá, <strong>{{params.NOME}}</strong>!</p>
        <p>Parabéns pela aquisição! Seu acesso ao nosso material foi processado e já está totalmente liberado no sistema.</p>

        <!-- DETALHES DO PLANO -->
        <div class="plan-box">
            <span class="plan-title">Seu Plano Ativo:</span>
            <p style="margin: 5px 0 0 0; font-size: 1.1rem; font-weight: bold;">{{params.PLANO}}</p>
        </div>

        <!-- CARD DO ORDER BUMP CASO TENHA COMPRADO -->
        {% if params.COMPROU_ORDERBUMP %}
        <div class="bump-card">
            <span class="bump-title">🎉 Parabéns pelo Upgrade!</span>
            <p style="margin: 5px 0 0 0; font-size: 0.85rem; color: #ffffff;">
                Identificamos que você também garantiu o produto adicional: <br>
                <strong>{{params.NOME_ORDERBUMP}}</strong>.<br>
                Ele já foi liberado e está disponível na sua área de membros!
            </p>
        </div>
        {% endif %}

        <p>Para entrar no seu painel de estudos, clique no botão abaixo e faça login inserindo o seu e-mail cadastrado:</p>

        <!-- BOTÃO DE LOGIN -->
        <div style="text-align: center;">
            <a href="{{params.LINK_MEMBROS}}" class="cta-button">ACESSAR ÁREA DE MEMBROS</a>
        </div>

        <!-- LINK COMPLETO / EXTENSO EMBAIXO -->
        <p style="margin-top: 20px; margin-bottom: 5px; font-size: 0.85rem; font-weight: bold; color: #616161;">Caso o botão acima não funcione, copie e cole o endereço abaixo no seu navegador:</p>
        <div class="raw-link">
            {{params.LINK_MEMBROS}}
        </div>

        <div class="footer">
            <p>Ambiente seguro de aprendizagem. Se precisar de ajuda, responda a este e-mail.</p>
        </div>
    </div>
</body>
</html>`;

serve(async (req) => {
  // Configurar CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    })
  }

  try {
    const payload = await req.json();
    
    // 1. Filtrar eventos de pagamento aprovado
    const status = payload.payment?.status;
    if (status !== 'paid' && payload.event !== 'pix.paid') {
      return new Response(JSON.stringify({ message: "Ignore non-paid events" }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const customerName = payload.customer.name;
    const customerEmail = payload.customer.email.toLowerCase().trim();

    // 2. Detectar se comprou Order Bump na lista de produtos
    const products = payload.products || [];
    const comprouSuplementacao = products.some((p: any) => p.type === 'orderbump' && p.title.toLowerCase().includes('suplementa'));
    const comprouMedicamentos = products.some((p: any) => p.type === 'orderbump' && p.title.toLowerCase().includes('medicamento'));

    const activeBumps = [];
    const activeBumpNames = [];
    if (comprouSuplementacao) {
      activeBumps.push('suplementacao');
      activeBumpNames.push("Kit Completo de Suplementação Mineral Bovina");
    }
    if (comprouMedicamentos) {
      activeBumps.push('medicamentos');
      activeBumpNames.push("250 Medicamentos Veterinários Ilustrados");
    }

    const comprouOrderbump = activeBumps.length > 0;
    const nomeOrderbump = activeBumpNames.join(" e ");
    
    // Definir plano final no banco de dados
    let planoFinal = 'completo';
    if (activeBumps.length > 0) {
      planoFinal = 'completo_' + activeBumps.join('_');
    }

    // 3. Upsert no Supabase
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: dbError } = await supabaseClient
      .from('usuarios')
      .upsert({
        nome: customerName,
        email: customerEmail,
        plano: planoFinal,
        status: 'paid'
      }, { onConflict: 'email' });

    if (dbError) throw dbError;

    // 4. Montar o HTML do e-mail
    let emailHtml = EMAIL_TEMPLATE
      .replaceAll('{{params.NOME}}', customerName)
      .replaceAll('{{params.EMAIL}}', customerEmail)
      .replaceAll('{{params.PLANO}}', comprouOrderbump ? "Plano Completo + Adicional(is)" : "Plano Completo")
      .replaceAll('{{params.LINK_MEMBROS}}', 'https://www.pesobovino.hyzencompra.shop/areademembros');

    if (comprouOrderbump) {
      emailHtml = emailHtml
        .replaceAll('{{params.NOME_ORDERBUMP}}', nomeOrderbump)
        .replace('{% if params.COMPROU_ORDERBUMP %}', '')
        .replace('{% endif %}', '');
    } else {
      emailHtml = emailHtml.replace(/{% if params.COMPROU_ORDERBUMP %}[\s\S]*?{% endif %}/g, '');
    }

    // 5. Disparar e-mail no Brevo
    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: "Ganho de Peso Bovino", email: "pesobovino@hyzencompra.shop" },
        to: [{ email: customerEmail, name: customerName }],
        subject: "Seu acesso ao Ganho de Peso Bovino foi liberado! 🐂",
        htmlContent: emailHtml
      })
    });

    if (!brevoResponse.ok) {
      const errText = await brevoResponse.text();
      console.error("Erro Brevo:", errText);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    console.error("Erro no processamento:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
});
