# Boutique DigiLine : version Netlify (gratuite)

Votre site de vente complet :

- **Boutique** (`/`) : le câble, le formulaire de commande, un code de suivi (`DL-XXXXXX`) pour chaque commande.
- **Suivi** (`/#suivi`) : le client entre son code et voit où en est sa commande. Aucun compte nécessaire.
- **Administration** (`/admin`) : réservée à vous, protégée par mot de passe. Vous confirmez ou refusez, expédiez, puis marquez « livrée, paiement reçu ».
- Paiement **à la livraison**. Aucun lien vers l'administration n'apparaît sur la boutique.

## Mise en ligne, pas à pas

### 1. Mettre les fichiers sur GitHub
1. Ouvrez votre dépôt privé `digiline-shop` sur GitHub.
2. Supprimez les anciens fichiers (ouvrir chaque fichier, icône poubelle, « Valider les modifications ») ou créez un **nouveau dépôt privé** (plus simple) nommé `digiline-netlify`.
3. Décompressez le zip sur votre ordinateur. **Ouvrez le dossier** puis glissez **son contenu** dans la page « Téléverser des fichiers » : `netlify.toml`, `package.json`, le dossier `netlify` et le dossier `public` doivent être **à la racine** du dépôt, pas dans un sous-dossier.
4. Cliquez sur « Valider les modifications ».

### 2. Créer le site sur Netlify
1. Sur https://app.netlify.com : **Add new project**, puis **Import an existing project**, **GitHub**. Autorisez l'accès à votre dépôt et choisissez-le.
2. Laissez les réglages tels quels (la commande de build est vide, le dossier publié est `public`, c'est déjà dans `netlify.toml`).
3. **Avant** de lancer le déploiement, ou juste après, ajoutez les variables ci-dessous.

### 3. Ajouter vos mots de passe (obligatoire)
Dans Netlify : **Site configuration**, **Environment variables**, **Add a variable**.

| Variable | Valeur |
|---|---|
| `ADMIN_PASSWORD` | Votre mot de passe administrateur, 10 caractères minimum (une phrase de 4 mots ou plus) |
| `SESSION_SECRET` | Une longue suite de lettres et chiffres au hasard, 16 caractères minimum (tapez-en 40 au hasard) |

Variables facultatives : `SHOP_NAME`, `WHATSAPP_NUMBER` (chiffres seulement, avec l'indicatif), `WHATSAPP_DISPLAY`, `CONTACT_EMAIL`, `UNIT_PRICE` (10), `OLD_PRICE` (12, `0` pour retirer le prix barré), `CURRENCY` (`$`).

**Important :** après avoir ajouté ou changé une variable, relancez un déploiement (**Deploys**, **Trigger deploy**, **Deploy site**). Sans cela elle n'est pas prise en compte. Tant que `ADMIN_PASSWORD` et `SESSION_SECRET` manquent, l'administration reste fermée.

### 4. Tester
1. Ouvrez l'adresse donnée par Netlify (`https://xxxx.netlify.app`) et passez une commande de test.
2. Allez sur `https://xxxx.netlify.app/admin`, connectez-vous, confirmez puis expédiez puis livrez la commande.
3. Vérifiez le suivi avec le code reçu.
4. Pour changer l'adresse, Netlify permet de modifier le nom `xxxx` (**Domain management**) ou d'ajouter votre propre nom de domaine.

## Utilisation au quotidien
- Une commande arrive « En attente » ; la liste se met à jour toute seule.
- **Confirmer**, **Marquer expédiée**, **Livrée, paiement reçu** : dans cet ordre, aucune étape ne se saute.
- **Écrire au client** ouvre WhatsApp avec un message prêt.
- **Ajouter une commande** enregistre une commande reçue par téléphone ou WhatsApp.
- **Exporter en tableau (CSV)** : faites-le chaque semaine, c'est votre sauvegarde.

## Sécurité
- Mot de passe jamais écrit dans le code. Après 8 essais ratés en 15 minutes, la connexion est bloquée un moment.
- Connexion de 12 heures, puis mot de passe redemandé.
- Le suivi par code ne montre ni nom, ni téléphone, ni adresse.
- Si vous pensez que le mot de passe a fuité, changez `ADMIN_PASSWORD` et `SESSION_SECRET` dans Netlify, puis redéployez.

## À savoir
- Offre gratuite Netlify : un quota mensuel de crédits est inclus. Vérifiez sur https://www.netlify.com/pricing ce qui se passe si vous le dépassez avant de lancer de la publicité.
- Les commandes sont enregistrées dans Netlify (stockage « Blobs »). Exportez le CSV régulièrement.
- Photos : elles viennent d'oraimo. Vérifiez que vous avez le droit de les utiliser. Pour mettre les vôtres, remplacez les fichiers de `public/img/` en gardant les mêmes noms.
