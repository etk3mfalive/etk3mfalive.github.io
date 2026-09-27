---
title: 树
date: 2026-04-28
categories: code
---

## 树同构

<!-- more -->

```
#include <iostream>
#include <vector>
#include <set>
#include <random>
#include <ctime>
using ull=unsigned long long;
using namespace std;
const int N=1e6+10;
const ull mask=time(nullptr);
vector <int> to[N];
<!-- more -->

set <ull> treeval;
int n,u,v;
ull val[N];
ull shift(ull x){
	x^=mask;
	x^=x<<13;
	x^=x>>7;
	x^=x<<17;
	x^=mask;
	return x;
}
void getval(int u,int fa){
	val[u]=1;
	for (int v:to[u]){
		if (v==fa) continue;
		getval(v,u);
		val[u]+=shift(val[v]);
	}
	treeval.insert(val[u]);
}
int main(){
	scanf("%d",&n);
	for (int i=1;i<n;++i){
		scanf("%d%d",&u,&v);
		to[u].push_back(v);
		to[v].push_back(u);
	}
	getval(1,0);
	printf("%d\n",treeval.size());
	return 0;
}
```
