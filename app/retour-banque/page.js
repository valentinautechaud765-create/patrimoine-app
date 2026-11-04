"use client";
// Page d'arrivée après la connexion à la banque (Powens).
// Sur iPhone, si Patrimo est installé sur l'écran d'accueil, Powens s'ouvre dans Safari : on dit
// simplement de revenir dans l'appli (l'import s'y lance tout seul). Dans le navigateur où l'on est
// connecté, on retourne directement dans l'appli.
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Icon from "../components/Icon.js";
import { BrandMark } from "../components/Brand.js";
import { supabaseBrowser } from "../../lib/supabase.js";

function Retour() {
  const params = useSearchParams();
  const statut = params.get("banque") || "erreur", raison = params.get("raison") || "";
  const [mode, setMode] = useState("check");
  const target = "/app?" + params.toString();
  useEffect(() => {
    (async () => {
      try {
        const sb = supabaseBrowser();
        const { data } = sb ? await sb.auth.getSession() : { data: {} };
        const installed = window.navigator.standalone || window.matchMedia("(display-mode: standalone)").matches;
        if (data?.session || installed) { window.location.replace(target); return; }
      } catch {}
      setMode("safari");
    })();
  }, []); // eslint-disable-line

  const ok = statut === "ok", partiel = statut === "partiel";
  return <main className="returnPage">
    <div className="returnCard">
      <BrandMark size={40} />
      {mode === "check" ? <p className="muted">Retour vers Patrimo…</p> : <>
        <span className={"returnIco " + (ok || partiel ? "ok" : "bad")}><Icon name={ok || partiel ? "check" : "info"} size={26} stroke={2.2} /></span>
        <h1>{ok ? "Banque connectée" : partiel ? "Banque connectée" : "La connexion n’a pas abouti"}</h1>
        <p>{ok ? "Vos comptes ont été ajoutés." : partiel ? "L’import des comptes va se relancer dans l’appli." : raison || "Réessayez depuis l’appli."}</p>
        <div className="returnSteps">
          <b>Revenez dans l’appli Patrimo</b>
          <span>Fermez cette page et rouvrez Patrimo depuis votre écran d’accueil : vos comptes s’importent automatiquement.</span>
        </div>
        <a className="btn primary lg block" href={target}>Continuer dans le navigateur</a>
      </>}
    </div>
  </main>;
}

export default function Page() { return <Suspense fallback={null}><Retour /></Suspense>; }
