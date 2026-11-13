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
