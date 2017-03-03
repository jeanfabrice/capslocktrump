# CAPSLOCKTRUMP
`capslocktrump` est une suite d'images Docker utilisée pour alimenter différents canaux de publication à partir des tweets du compte [@realdonaldtrump](https://twitter.com/realdonaldtrump), tweets desquels sont extraits les séquences en CAPSLOCK.

Les canaux de publication supportés sont : 

* [Google Sheet](tree/master/google-publisher)
* [Twitter](tree/master/twitter-publisher)
* [Instagram](tree/master/instagram-publisher)

# Principe de fonctionnement
```
                      +--------------------+
                      |                    |
                      |  @realdonaldtrump  |
                      |                    |
                      +----------+---------+
                                 |
                                 1
                                 |                                +----------+
                       +---------v--------+                       |          |
                       |                  |             +---3----->  Filter  |
                       |  twitter-reader  |             |         |          |
                       |                  |             |         +-----+----+
                       +---------+--------+             |               |
                                 |               +------+-----+         3
                                 |               |            |         |
                                 +--------2------>  RabbitMQ  <---------+
                                                 |            |
                                                 +-+----+---+-+
                                                   |    |   |
                                                   |    |   |
                              +------------4-------+    4   +-------4-------------+
                              |                         |                         |
                              |                         |                         |
                              |                         |                         |
                   +----------v----------+   +----------v---------+   +-----------v-----------+
                   |                     |   |                    |   |                       |
                   |  twitter-publisher  |   |  google-publisher  |   |  instagram-publisher  |
                   |                     |   |                    |   |                       |
                   +---------------------+   +--------------------+   +-----------------------+
```

1. Les tweets sont capturés par un container [twitter-reader](tree/master/twitter-reader) et/ou [file-reader](tree/master/file-reader)
2. Les tweets capturés sont publiés intégralement auprès d'un container RabbitMQ, avec une clé de routage spécifique
3. Un container [filter](tree/master/filter) récupère les tweets de RabbitMQ à l'aide de la clé de routage connue, en extrait les séquences en CAPSLOCK, applique une série de filtres visant à améliorer la qualité des séquences extraites (suppression des acronymes, des abréviations usuelles, etc.) puis republie auprès du container RabbitMQ les séquences retenues, avec une nouvelle clé de routage.
4. Les containers google-publisher, twitter-publisher et instagram-publisher publient finalement, sur leur média respectif, les séquences en CAPSLOCK récupérées sur RabbitMQ


# Installation

Les containers crées à partir des images Docker fournies nécéssitent certains éléments de configuration.

Dans la majorité des cas, il s'agit d'un ou plusieurs fichiers au format json. Un exemple de ces fichiers est fourni systématiquement, avec une extention '.template'.

## Container [file-reader](tree/master/file-reader)
Fichier de configuration attendu :

* [`config.json`](blob/master/file-reader/config.json.template)

## Container [twitter-reader](tree/master/twitter-reader)
Fichiers de configuration attendus :

* [`config.json`](blob/master/twitter-reader/config.json.template)
* [`client_secret.json`](blob/master/twitter-reader/client_secret.json.template)
* [`user_secret.json`](blob/master/twitter-reader/user_secret.json.template)

## Container [filter](tree/master/filter)
Fichier de configuration attendu :

* [`config.json`](blob/master/twitter-reader/config.json.template)

## Container [google-publisher](tree/master/google-publisher)
Fichiers de configuration attendus :

* [`config.json`](blob/master/google-publisher/config.json.template)
* [`client_secret.json`](blob/master/google-publisher/client_secret.json.template)
* [`user_secret.json`](blob/master/google-publisher/user_secret.json.template)

## Container [twitter-publisher](tree/master/twitter-publisher)
Fichiers de configuration attendus :

* [`config.json`](blob/master/twitter-publisher/config.json.template)
* [`client_secret.json`](blob/master/twitter-publisher/client_secret.json.template)
* [`user_secret.json`](blob/master/twitter-publisher/user_secret.json.template)

## Container [instagram-publisher](tree/master/instagram-publisher)
Fichiers de configuration attendus :

* [`config.json`](blob/master/instagram-publisher/config.json.template)
* [`credentials.json`](blob/master/instagram-publisher/credentials.json.template)

# docker-compose
Un fichier [docker-compose.yml](blob/master/docker-compose.yml) est fourni à titre d'exemple.

# Démonstration
`capslocktrump` est utilisée pour alimenter de manière automatique :

* le compte Twitter [@CAPSLOCKTRUMP](https://twitter.com/CAPSLOCKTRUMP)
* le compte Instagram [@CAPSLOCKTRUMP](https://instagram.com/CAPSLOCKTRUMP)
* la feuille Google Sheets [The Capslocktrump Google Sheet](https://docs.google.com/spreadsheets/d/1zXpFsdAZ1xPEMCaiVQxFoX_Ec1yPvkoKs6kpt-qm-6I/edit?usp=sharing)

# Crédits
Idée originale de [**@ff_ff**](https://twitter.coml/ff_ff)

Crée et maintenu par [**@jean_fabrice**](https://twitter.com/jean_fabrice)

# License
`capslocktrump` est distribué sous [licence MIT](http://opensource.org/licenses/MIT). Consultez le fichier [`LICENSE`](https://github.com/jeanfabrice/capslocktrump/raw/master/LICENSE) pour plus d'information.
