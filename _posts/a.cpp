#include <bits/stdc++.h>
using namespace std;
int n,m,k;
const int N=1e5+10;
struct node{
    int t,id;
}a[N],b[N];
bool cmp(const node&a,const node&b){
    return a.t<b.t;
}
vector <tuple<int,int,int> > ans;
bool check(int t,int p){
    int num[2]={n,m};
    ans.clear();
    while (num[0]+num[1])
    if (num[p^1]){
        if (num[p^1]+k>t) return false;
        p^=1,num[p]--,t-=k;
    }else{
        p^=1,t-=k;
    }
    return true;
}
int main(){
    scanf("%d%d%d",&n,&m,&k);
    for (int i=1;i<=n;++i) scanf("%d",&a[i].t),a[i].id=i;
    for (int i=1;i<=m;++i) scanf("%d",&b[i].t),b[i].id=i;
    sort(a+1,a+1+n,cmp);
    sort(b+1,b+1+m,cmp);
    int l=0,r=2e9;
    while (l<=r){
        int mi=(l+r)>>1;
        if (check(mi,0)||check(mi,1)) r=mi-1;
        else l=mi+1;
    }
    printf("%d\n",l);
    return 0;
}