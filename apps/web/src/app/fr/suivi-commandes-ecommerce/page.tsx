import type { Metadata } from 'next';
import SolutionPage from '../../SolutionPage';

const canonical = 'https://tajertrack.vercel.app/fr/suivi-commandes-ecommerce';

export const metadata: Metadata = {
  title: 'Suivi des commandes e-commerce en Algérie',
  description: 'Envoyez le lien de suivi depuis votre propre numéro et votre carte SIM avec TajerTrack, sans frais SMS facturés par TajerTrack.',
  alternates: {
    canonical,
    languages: {
      'fr-DZ': canonical,
      'ar-DZ': 'https://tajertrack.vercel.app/solutions/sms-order-tracking-algeria',
    },
  },
  openGraph: {
    type: 'article',
    locale: 'fr_DZ',
    url: canonical,
    title: 'Suivi des commandes e-commerce en Algérie | TajerTrack',
    description: 'Lien de suivi envoyé par SMS, Telegram en complément, suivi de livraison et demandes d’échange après réception.',
  },
};

export default function FrenchOrderTrackingSolution() {
  return (
    <SolutionPage
      language="fr"
      direction="ltr"
      eyebrow="Pour les boutiques en ligne en Algérie"
      title="Suivi des commandes e-commerce par SMS"
      intro="TajerTrack est une plateforme de suivi des commandes conçue pour les boutiques e-commerce en Algérie. Le lien de suivi est envoyé par SMS depuis votre propre numéro et votre carte SIM, sans frais SMS facturés par TajerTrack. Votre client consulte ensuite l’avancement de sa livraison sur une page aux couleurs de votre boutique. Telegram reste un canal complémentaire."
      sections={[
        {
          id: 'suivi-sms',
          title: 'Comment fonctionne le suivi de commande par SMS ?',
          paragraphs: [
            'Le client reçoit un SMS contenant le lien de sa page de suivi. En ouvrant ce lien, il retrouve les informations de sa commande et les dernières étapes de livraison disponibles dans TajerTrack.',
            'La page de suivi peut reprendre le nom, le logo et les couleurs de la boutique. Le client consulte ainsi les informations utiles depuis un seul lien, sans devoir rechercher les mises à jour dans plusieurs conversations.',
          ],
          bullets: [
            'Envoi du lien de suivi de commande par SMS.',
            'Affichage des statuts et événements de livraison disponibles.',
            'Page de suivi personnalisée à l’image de la boutique.',
            'Telegram disponible comme canal d’envoi complémentaire, selon les réglages du commerçant.',
          ],
        },
        {
          id: 'sms-votre-numero',
          title: 'Vos SMS, depuis votre propre numéro, sans frais TajerTrack',
          paragraphs: [
            'Le lien de suivi part de votre propre numéro et de votre carte SIM grâce à la passerelle SMS intégrée à TajerTrack. Vous n’avez pas de crédit SMS à acheter auprès de TajerTrack et la plateforme ne facture pas de frais par message. Les éventuels coûts ou débits dépendent de votre forfait et de votre opérateur mobile.',
            'L’envoi SMS fait ainsi partie du parcours de suivi TajerTrack, plutôt que d’un solde de messages séparé à recharger sur une plateforme tierce.',
          ],
          bullets: [
            'Envoi depuis votre numéro et votre carte SIM.',
            'Aucun portefeuille SMS ni frais par message facturé par TajerTrack.',
            'Les éventuels frais dépendent de votre forfait opérateur.',
          ],
        },
        {
          id: 'transporteurs',
          title: 'Suivi des livraisons et transporteurs',
          paragraphs: [
            'Le commerçant peut connecter les sources de commandes et les transporteurs pris en charge. Les mises à jour transmises par le transporteur peuvent alors apparaître sur la page de suivi. TajerTrack regroupe des intégrations avec plus de 80 sociétés de livraison en Algérie, selon les données et les événements disponibles pour chaque intégration.',
            'TajerTrack n’est pas un transporteur et ne livre pas les colis. La plateforme organise les informations de commande et rend le suivi plus clair pour le commerçant et son client.',
          ],
        },
        {
          id: 'apres-vente',
          title: 'Un suivi qui continue après la livraison',
          paragraphs: [
            'Lorsque le commerçant active la fonctionnalité, le client peut envoyer une demande d’échange depuis sa page de suivi après réception de la commande. Le commerçant examine la demande et décide de l’accepter ou de la refuser.',
            'Si un envoi de remplacement est associé à la demande, le client peut suivre ce nouvel envoi depuis le lien de suivi d’origine.',
          ],
        },
        {
          id: 'pour-qui',
          title: 'À qui s’adresse TajerTrack ?',
          paragraphs: [
            'La plateforme s’adresse aux boutiques en ligne qui souhaitent partager le suivi de leurs commandes par SMS, réduire les questions répétées sur l’état des colis et garder une expérience cohérente après l’achat.',
            'Les réglages des canaux d’envoi et les détails de configuration sont disponibles dans le tableau de bord commerçant.',
          ],
        },
      ]}
      faqs={[
        {
          question: 'TajerTrack envoie-t-il le lien de suivi par SMS ?',
          answer: 'Oui. TajerTrack envoie le lien de la page de suivi au client par SMS. Les options de configuration sont disponibles dans le tableau de bord.',
        },
        {
          question: 'TajerTrack facture-t-il les SMS ?',
          answer: 'Non. TajerTrack ne vend pas de crédit SMS et ne facture pas chaque message. Les SMS sont envoyés depuis votre propre numéro et votre carte SIM via la passerelle intégrée ; les éventuels coûts dépendent de votre forfait opérateur.',
        },
        {
          question: 'Dois-je acheter un crédit SMS auprès de TajerTrack ?',
          answer: 'Non. Vous utilisez votre propre SIM et votre numéro ; aucun solde SMS TajerTrack n’est à recharger.',
        },
        {
          question: 'Quelle est la différence entre les SMS de TajerTrack et SuiviSMS ?',
          answer: 'Le mode d’envoi est différent. TajerTrack envoie le lien de suivi depuis votre propre numéro et votre carte SIM via sa passerelle intégrée, sans portefeuille SMS ni frais par message facturés par TajerTrack ; les éventuels coûts dépendent de votre forfait mobile. SuiviSMS présente un service SMS payant reposant sur un solde à recharger. Il ne faut donc pas confondre les deux modèles.',
        },
        {
          question: 'Telegram est-il obligatoire ?',
          answer: 'Non. Telegram est un canal complémentaire ; le SMS est le canal principal présenté pour l’envoi du lien de suivi.',
        },
        {
          question: 'TajerTrack remplace-t-il les sociétés de livraison ?',
          answer: 'Non. Les transporteurs restent responsables du transport. TajerTrack regroupe les informations de commande et affiche les mises à jour disponibles.',
        },
        {
          question: 'Le client peut-il demander un échange ?',
          answer: 'Oui, lorsque le commerçant active les demandes d’échange. Le client peut envoyer sa demande après réception et suivre l’envoi de remplacement depuis le lien d’origine.',
        },
      ]}
      relatedLinks={[
        { href: '/solutions/sms-order-tracking-algeria', label: 'Découvrir le suivi de commande par SMS (arabe)', lang: 'ar', dir: 'rtl' },
        { href: '/solutions/after-sales-ecommerce-algeria', label: 'Découvrir les services après-vente (arabe)', lang: 'ar', dir: 'rtl' },
        { href: '/', label: 'Retour à TajerTrack' },
      ]}
    />
  );
}
