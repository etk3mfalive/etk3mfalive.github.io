---
title: PKU Campus 2023A
date: 2026-05-02
categories: code
---

<!-- more -->

A
神秘贪心挺有意思的

```
#include <iostream>
#include <algorithm>
using namespace std;
const int N=1e5+10;
int T,n,x,y,val,r,q[N];
bool cmp(const int &x,const int &y){
    return x>y;
}
int main(){
<!-- more -->

    scanf("%d",&T);
    while (T--){
        scanf("%d",&n);
        x=y=r=0;
        for (int i=1;i<=n;++i)
            for (int j=1;j<=i;++j){
                scanf("%d",&val);
                int s=i-j+1,t=n-j+1;
                if (s<=t/2) x+=val;
                else if (t-s+1<=t/2) y+=val;
                else q[++r]=val;
            }
        sort(q+1,q+1+r,cmp);
        for (int i=1;i<=r;++i)
            if (i&1) x+=q[i];else y+=q[i];
        printf("%d %d\n",x,y);
    }
    return 0;
}
```
