---
title: "Kubernetes Pod スケジューリングの使い分け"
category: "infra"
labels:
  - "infra"
  - "type:comparison"
  - "demo"
closed_at: "2026-07-18T03:15:00Z"
demo: true
---

# Kubernetes Pod スケジューリングの使い分け

## 概要

Kubernetesでは、`nodeSelector`、Affinity、Taint/Tolerationを使ってPodの配置先を制御します。「どこへ置きたいか」と「どのPodを受け入れたくないか」を分けて考えるのがポイントです。

## 何が嬉しいのか

- GPUなど特殊なノードへ対象Podだけを配置できる
- 障害ドメインをまたいでPodを分散できる
- システム用ノードへ一般ワークロードが入るのを防げる

## 詳細

### nodeSelector

ラベルが一致するノードだけを配置候補にする、最も単純な指定です。

```yaml
spec:
  nodeSelector:
    accelerator: gpu
```

### Affinity

複数条件や「できれば配置したい」という優先条件を表現できます。Pod Anti-Affinityを使えば、同じアプリのPodを異なるノードへ分散できます。

### Taint / Toleration

ノード側からPodを拒否する仕組みです。Tolerationは拒否を解除するだけで、そのノードへの配置を保証するものではありません。

## 参考リンク

- [Assigning Pods to Nodes](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/)
