import { NextResponse } from "next/server";
import { NOME_COOKIE_SESSAO } from "@/lib/auth";

// Ver nota em app/api/auth/balcao/route.ts sobre o uso de
// NextResponse.cookies em vez de removerCookieSessao.
export async function POST() {
  const resposta = new NextResponse(null, { status: 204 });
  resposta.cookies.delete(NOME_COOKIE_SESSAO);
  return resposta;
}
