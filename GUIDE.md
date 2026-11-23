# Ton site — guide d'utilisation

## Comment ça marche
- Tout le contenu du site (projets, textes, photos) est rangé dans ce dossier, stocké sur **GitHub**.
- **Pages CMS** (app.pagescms.org) te donne une interface simple pour le modifier : formulaires, glisser-déposer de photos.
- À chaque enregistrement, **Netlify** reconstruit et met en ligne le site tout seul (environ 1 minute).

## Ajouter un nouveau projet
1. Pages CMS › **Projets** › *Add an entry*.
2. Remplis le titre, la rubrique et les crédits.
3. Ajoute les **vignettes** : 3 pour Narrative et Commercials, 5 pour Beauty. Ajoute aussi la vignette pour téléphone.
4. Dans **Contenu de la page**, ajoute les blocs dans l'ordre que tu veux :
   - *Vidéo* : colle le lien Vimeo ou YouTube et choisis le format (16:9, 9:16…).
   - *Plusieurs vidéos côte à côte* : pour les formats verticaux de la rubrique Beauty.
   - *Diaporama de photos* : glisse les photos (JPG, PNG, peu importe la taille).
   - *Photos en grille* et *Texte*.
5. Enregistre (*Save*).
6. Va dans **Rubriques**, ouvre la bonne liste, ajoute le projet et place-le à l'endroit voulu. Enregistre.
7. Pour la page **Work** : **Rubriques › All — ordre des projets**, ajoute le projet et place-le où tu veux dans « All ». (S'il n'y est pas, il apparaît quand même, à la fin.)

## Page Work (vincentweiler.com/work/)
- C'est la page de tous les projets, ouverte en cliquant sur l'accueil. Le menu All · Narrative · Commercials · Beauty · Info y mène depuis toutes les pages.
- **Ordre de « All »** : Rubriques › *All — ordre des projets*. Glisse les projets dans l'ordre voulu.
- **Narrative, Commercials, Beauty** gardent l'ordre de leur propre liste dans Rubriques.
- Les vignettes Beauty y sont recadrées (presque carrées) pour avoir la même hauteur que les autres. Si tu changes une vignette Beauty, demande à Claude d'ajuster le cadrage.

## Changer ou réordonner des photos
Ouvre le projet, puis le bloc concerné. Tu peux :
- ajouter une photo avec *Add* ;
- en retirer une avec la croix ;
- changer l'ordre en glissant les photos.

Les photos sont automatiquement redimensionnées (2000 px de large maximum) et converties pour le web.

## Le reste
- **Accueil** : images de fond pour ordinateur et pour téléphone, vitesse du défilement.
- **Info** : photos, texte de présentation, clients, liens.
- **Contact**, **Showreel** et **Réglages du site** (titre et description pour Google).

## Bon à savoir
- Un projet absent des listes de Rubriques reste en ligne à son adresse (ex. vincentweiler.com/mon-projet/), mais n'apparaît dans aucune liste. C'est pratique pour préparer un projet en avance.
- Les anciennes adresses Cargo (ex. /monot-desktop) redirigent automatiquement vers les nouvelles (/monot/).
- Une erreur ? Toutes les modifications sont historisées sur GitHub, donc tout peut être annulé.
- La mise en page elle-même (polices, marges, en-tête) se trouve dans le dossier `build/`. Pour la changer, demande à Claude.

## Ne pas compter mes propres visites dans Google Analytics

- Sur chaque appareil que tu utilises (Mac, téléphone, chaque navigateur), ouvre une fois **vincentweiler.com/?notrack**. Tes visites ne sont plus comptées sur cet appareil.
- Pour réactiver : **vincentweiler.com/?track**.
- À refaire si tu vides les données du navigateur, ou si tu n'as pas ouvert le site depuis plus de 7 jours dans Safari (Safari efface ce réglage).
- Automatique, sans rien faire : les aperçus (*.pages.dev) et les navigateurs automatisés (robots, Claude) ne sont jamais comptés.
